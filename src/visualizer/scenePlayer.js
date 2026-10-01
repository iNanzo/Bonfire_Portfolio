// A preset scene played on the show (Bonfire Live and the Bonfire Painter): the scene
// format (scenes.js) turned into the show's own terms and laid over it, part by part.
//
//   the overlay  most of a scene is a temporary layer of settings (layered.js) the whole
//                show reads first: the place, the render, the knights, the fireflies, and
//                (holding) the layers, the drop hits, the camera switch, no phrase swaps and
//                no scenery recolors (sceneOverrides).
//   the pins     what settings can't say is pinned in its own module: the look with its
//                layers, details and blends (looks.js pin, looksPin), the framing and its
//                slow move (camera.js pin, cameraPin), the flame (registered under its own
//                key, colors.js register) and the scenery's colors (colors.js pinScenery).
//   Hold / Base  holding, everything the scene sets stays for its stretch: the music only
//                pulses and drops it, and the drops re-forge the scene's own weapon in its
//                own colors. Base opens the stretch with the scene's place, colors, framing
//                and look (its own flame landing keeps its colors: keepsScenery), then the
//                show plays on (its cuts, looks and swaps take over, and its flames recolor
//                as the settings say); the render, the knights and the fireflies stay the
//                scene's.
//   one moment   apply() does it all at once, in order: the overlay, the flame and the
//                scenery colors, the weapon and element (unless a swap just `landed` them),
//                the scenery, the look, the camera, the render (in the same frame), the
//                knights (a hidden moment: knightShow.js retake, set up for the new place so
//                nothing is arranged twice) and the fireflies' show. Parts are diffed against
//                the last ones applied, so re-applying an edited scene (the Painter, a slider
//                moved) touches only the part that changed and keeps every other roll.
//   Low Flash    the flashy clamp: anything flashy the user has Off (the Low Flash preset,
//                or by hand), or that reduced motion keeps still, stays Off whatever the scene
//                says (FLASHY, FLASHY_DROPS; a flashy look, FLASHY_LOOKS, plays as Ember),
//                and a scene never throws more drop hits at once than the user's own count
//                (Low Flash's one). (The Echo look's palette steps follow the user's Color
//                Cycle switch too: looks.js, the director's `cycles`.)
//                The user's own Offs win the same way: Camera: Still holds the scene's
//                framing still (no move), and an element they've unchecked isn't the scene's
//                to bring (the show draws one of theirs: sceneElement).
//   reduced      reduced motion: every look moves with the music, so a scene's plays as
//   motion       Ember; the layers that move (MOVING_LAYERS: ghosting, motion blur, flicker)
//                stay off, and the still ones (scanlines, a gradient map, a repaint…) show as
//                painted, held still (looks.js answers no beat). The Painter passes
//                `paintedLook`: its look is what's being painted, so only its flashes are
//                clamped there.
//   by hand      release(keys): a setting the user just touched (the settings dialog, the P
//                menu) is theirs again until the next scene.
//   letting go   apply(null): the free show again, back in the user's own place with their
//                knights; at once (`instant`: the start screen) the look and framing go too,
//                otherwise each stays until the show's next turn or cut (no jump).
// Pure (no three.js, no DOM): the director hands it the show's parts.
import { DROP_FX, LAYERS, modeOf } from './looks.js';
import { KNIGHT_MOVES } from './knightShow.js';
import { FLY_MOVES } from './fireflyMoves.js';
import { FIRE_KEYS, parseRef } from '../scenes.js';

/** Settings a scene may never turn back on when the user has them Off (the Low Flash preset's). */
export const FLASHY = ['flash', 'blackout', 'flicker', 'hitFlash', 'xray', 'knightShine'];
/**
 * Drop hits a scene may never turn back on when the user has them Off: the X-Ray, the Ink
 * Flash (1-bit) and the Color Cycle (the palette spinning at 16 Hz).
 */
export const FLASHY_DROPS = ['xray', 'ink', 'cycle'];
/**
 * Looks a scene may not play when the user has them Off (Low Flash) or reduced motion is on:
 * Ink flashes the picture to 1-bit on the downbeats. The scene plays the clean look (Ember)
 * instead, with its layers and the rest as painted.
 */
export const FLASHY_LOOKS = ['ink'];
/**
 * Layers that move whatever the beat does: a scene's stay off under reduced motion (the
 * ghost's trail, the motion blur's smear, the flicker). The rest are still pictures (a
 * steady split, grain, bars, a repaint), shown as painted and held still.
 */
export const MOVING_LAYERS = ['ghost', 'blur', 'flicker'];
/** A scene's parts (holds()). */
export const SCENE_PARTS = ['place', 'colors', 'camera', 'look', 'render', 'knights', 'fireflies'];
/** No offsets: the fire as the music drives it. */
export const NO_OFFSETS = Object.freeze(Object.fromEntries(FIRE_KEYS.map((k) => [k, 0])));

/**
 * @typedef {import('../scenes.js').Scene} Scene
 * @typedef {import('./looks.js').LooksPin} LooksPin
 * @typedef {import('./clearing.js').CameraPin} CameraPin
 * @typedef {{ reducedMotion?: boolean, paintedLook?: boolean }} ClampOptions  `paintedLook`: the look
 *   plays as painted under reduced motion too (the Painter: it's what's being painted); only its flashes are clamped.
 */

const all = (names, on) => Object.fromEntries(Object.keys(names).map((k) => [k, on(k)]));
const noop = () => {};
/** Whether the user (or reduced motion) keeps a flashy switch off. */
const kept = (user, key, reducedMotion) => !!reducedMotion || modeOf(user?.[key]) === 'off';
/** Reduced motion holds the look still (unless it's the Painter's, being painted). */
const stillLook = (o) => !!o.reducedMotion && !o.paintedLook;
/** A layer's switch after the flashy clamp (and reduced motion's: no layer that moves). */
const layerOf = (scene, key, user, o) => {
  const m = modeOf(scene.layers?.[key] ?? 'off');
  if (FLASHY.includes(key) && kept(user, key, o.reducedMotion)) return 'off';
  return stillLook(o) && MOVING_LAYERS.includes(key) ? 'off' : m;
};

/**
 * The element a scene brings, when the user lets it: null when it leaves it to the show, or
 * when the user has it unchecked in Elements (the show draws one of theirs instead).
 * @param {Scene | null} scene
 * @param {Record<string, any>} [user]
 * @returns {string | null}
 */
export function sceneElement(scene, user = {}) {
  const el = scene?.place.element ?? null;
  return el && user?.elements?.[el] !== false ? el : null;
}

/**
 * A scene in the director's settings vocabulary (the overlay, layered.js): what it sets in
 * `mode` ('hold': the lot; 'base': the place, the render, the knights and the fireflies), with
 * the flashy clamp against the `user`'s own settings (and their Camera: Still). Pure.
 * @param {Scene} scene
 * @param {'hold'|'base'} mode
 * @param {Record<string, any>} [user]
 * @param {ClampOptions} [clamp]
 * @returns {Record<string, any>}
 */
export function sceneOverrides(scene, mode, user = {}, clamp = {}) {
  const { reducedMotion = false } = clamp;
  const hold = mode !== 'base';
  const r = scene.render;
  const k = scene.knights;
  const f = scene.fireflies;
  /** @type {Record<string, any>} */
  const o = {
    // The place (either way: the scenery mix doesn't move it).
    scenery: scene.place.scenery,
    // The render: the scene's, no shifts, few colors or x-ray flips over it; its x-ray view
    // held (unless the user keeps x-rays off).
    pixelSize: r.pixelSize,
    palette: Array.isArray(r.palette) ? [...r.palette] : r.palette,
    dither: r.dither,
    ditherMatrix: String(r.ditherMatrix),
    outlines: r.outlines,
    vignette: r.vignette,
    exposure: r.exposure,
    fog: r.fog,
    shadows: r.shadows,
    flameFps: r.flameFps,
    pixelShift: 'off',
    fewColors: 'off',
    xray: 'off',
    xrayView: r.xray && !kept(user, 'xray', reducedMotion) ? r.xray : null,
    // The knights: how many (none: off), each one's helmet (null: drawn), and the switches.
    knights: k.count > 0 ? 'on' : 'off',
    ...(k.count > 0 ? { knightCount: k.count } : {}),
    knightDance: k.dance,
    knightFormation: k.formation,
    ...(k.moves ? { knightMoves: all(KNIGHT_MOVES, (m) => k.moves.includes(m)) } : {}),
    knightHelmetOrder: [...k.helmets],
    knightShine: kept(user, 'knightShine', reducedMotion) ? 'off' : k.shine,
    knightReactions: k.reactions,
    knightFinish: k.finish,
    knightSeat: k.seat,
    // (Its Edge Glow as painted: Off, In the mix, rolled round its strength, or Always at it.)
    knightGlow: k.glow,
    knightRim: k.rim,
    ...(k.style ? { knightStyle: k.style } : {}),
    // The fireflies: the light show on or off, and the moves.
    blink: f.show !== 'off',
    ...(f.moves ? { flyMoves: all(FLY_MOVES, (m) => f.moves.includes(m)) } : {}),
  };
  if (!hold) return o;
  // Holding: no phrase swaps (drops only) and no recolored scenery; the camera's move (held
  // still when the user keeps the camera still); the look's layers; the scene's own drop hits.
  o.phraseBars = 0;
  o.sceneColors = 'off';
  o.camera = scene.camera.move.kind === 'still' || user?.camera === 'still' ? 'still' : 'drift';
  for (const key of Object.keys(LAYERS)) o[key] = layerOf(scene, key, user, clamp);
  if (scene.drops) {
    o.dropFx = all(DROP_FX, (key) => {
      const m = modeOf(scene.drops.fx?.[key] ?? 'off');
      return FLASHY_DROPS.includes(key) && (reducedMotion || modeOf(user?.dropFx?.[key], 'mix') === 'off') ? 'off' : m;
    });
    // (Never more hits at once than the user's own count: Low Flash's one stays one. The
    // Painter shows the count as painted: its settings are no one's.)
    const mine = Number(user?.dropCount);
    o.dropCount = clamp.paintedLook || !Number.isFinite(mine) ? scene.drops.count : Math.min(scene.drops.count, mine);
  }
  for (const key of FLASHY) if (key in o && kept(user, key, reducedMotion)) o[key] = 'off';
  return o;
}

/**
 * A scene's look as a pin (looks.js pin()): its look and strength, its own details, every
 * layer's switch (the flashy clamp applied, to a flashy look too; reduced motion: the clean
 * look, and no layer that moves), the details and blends it pinned, its drop hits.
 * @param {Scene} scene
 * @param {Record<string, any>} [user]
 * @param {ClampOptions} [clamp]
 * @returns {LooksPin}
 */
export function looksPin(scene, user = {}, clamp = {}) {
  const name = scene.look.name;
  const flashy = FLASHY_LOOKS.includes(name) && (!!clamp.reducedMotion || modeOf(user?.looks?.[name], 'mix') === 'off');
  return {
    look: flashy || stillLook(clamp) ? 'ember' : name,
    amount: scene.look.amount,
    params: { ...scene.look.params },
    layers: all(LAYERS, (key) => layerOf(scene, key, user, clamp)),
    details: structuredClone(scene.details ?? {}),
    blends: { ...scene.blends },
    dropFx: scene.drops ? { ...scene.drops.fx } : null,
  };
}

/**
 * A scene's framing as a pin (camera.js pin(), clearing.js movePose).
 * @param {Scene} scene
 * @returns {CameraPin}
 */
export function cameraPin(scene) {
  const c = scene.camera;
  return { pos: [...c.pos], target: [...c.target], fov: c.fov, roll: c.roll, move: { ...c.move } };
}

/**
 * The flame key a scene's colors are registered under: 'scene-b-<id>' (built in),
 * 'scene-m-<id>' (mine), from its library ref; 'scene-p-<id>' (no ref: the Painter's).
 * @param {Scene} scene
 * @param {string | null} [ref]
 */
export function sceneFlameKey(scene, ref = null) {
  const { source, id } = parseRef(ref);
  return source ? `scene-${source}-${id}` : `scene-p-${scene.id}`;
}

// Settings keys the user may release by part (release()): these hand a pin back too.
const CAMERA_KEYS = ['camera', 'shot', 'cutBars', 'transition'];
const COLOR_KEYS = ['colors', 'scheme', 'sceneColors'];

/**
 * The scene player. `parts`: the show's (the director's): the settings overlay (layered.js),
 * the looks, the colors, the camera, the knights' show, the render show and the fireflies'
 * light show; `user` the user's own settings (under the overlay: the flashy clamp reads
 * them); `effects` the site's effects (the fireflies' own count, given back after a scene);
 * `reducedMotion` and `paintedLook` the clamp's (ClampOptions); `onScene(scene, ref, mode)`
 * whenever the scene playing changes (null: the free show); `now()` performance time in seconds.
 * @param {any} fire the bonfire (scene.js createBonfire)
 * @param {{ layers: ReturnType<typeof import('./layered.js').createLayered>, looks: any, colors: any, camera: any,
 *   knights: any, render: any, show?: any, user?: Record<string, any>, effects?: any, reducedMotion?: boolean,
 *   paintedLook?: boolean, onScene?: (scene: Scene | null, ref: string | null, mode: 'hold'|'base'|null) => void,
 *   now?: () => number }} parts
 */
export function createScenePlayer(fire, {
  layers, looks, colors, camera, knights, render, show = null, user = {}, effects = null, reducedMotion = false,
  paintedLook = false, onScene = () => {}, now = () => performance.now() / 1000,
}) {
  /** @type {Scene | null} */
  let scene = null;
  /** @type {string | null} */
  let ref = null;
  /** @type {'hold'|'base'|null} */
  let mode = null;
  let flameKey = null;
  let last = {};                 // each part as last applied (JSON)
  const released = new Set();   // settings keys the user took back
  const clampOpts = { reducedMotion, paintedLook };

  const flies = () => fire.fireflies ?? null;
  /** The fireflies' count scaled like the scene's own (phones fly fewer). */
  const litFor = (n) => {
    const fl = flies();
    const count = effects?.fireflies?.count;
    return fl?.flies && count ? Math.round((n * fl.flies.length) / Math.max(1, count)) : n;
  };
  /** The overlay less what the user took back. */
  function overlay() {
    const o = sceneOverrides(scene, mode, user, clampOpts);
    for (const k of released) delete o[k];
    return o;
  }
  /** The look's pin, with the layers the user took back at their own switches. */
  function lookPin() {
    const p = looksPin(scene, user, clampOpts);
    for (const k of Object.keys(LAYERS)) if (released.has(k)) p.layers[k] = modeOf(user[k]);
    return p;
  }
  /** Each part as JSON, for the diff. */
  function partsOf() {
    const s = scene;
    return {
      overlay: JSON.stringify(overlay()),
      flame: JSON.stringify(s.colors.flame),
      scenery: JSON.stringify([s.colors.scenery, mode]),
      equip: JSON.stringify([s.colors.flame, s.place.weapon, sceneElement(s, user)]),
      place: s.place.scenery,
      look: JSON.stringify([lookPin(), mode]),
      camera: JSON.stringify([s.camera, mode]),
      knights: JSON.stringify(s.knights),
      fireflies: JSON.stringify(s.fireflies),
    };
  }
  /**
   * The free show again: the overlay off, the colors let go, the user's own place and knights
   * back in the same moment. The look and the framing stay until the show's next turn or cut
   * (no jump in a live moment); `instant` (nothing coming to take them over: the start
   * screen, Scenes switched off with no music) lets them go now, the show's look taking a
   * new turn of its own.
   */
  function letGo({ flash = false, instant = false, retake = true, groove = false, budget = 1 } = {}) {
    layers.set(null);
    colors.release();
    const p = looks.pinned;
    if (instant) {
      if (p) { looks.pin(null); looks.next(user.looks); }
      camera.pin?.(null);
    } else {
      if (p && looks.held) looks.pin(p, { hold: false, fresh: false });
      camera.letGo?.();
    }
    const fl = flies();
    if (fl && effects) fl.setLit?.(litFor(effects.fireflies.lit));
    scene = null;
    ref = null;
    mode = null;
    flameKey = null;
    last = {};
    released.clear();
    // Back to the user's own place, and their knights, in the same moment.
    if (user.scenery && user.scenery !== 'mix' && fire.scenery && fire.scenery !== user.scenery) fire.setScenery?.(user.scenery, { flash: flash && !instant });
    render.update?.(now());
    if (retake) knights.retake(fire.knights, { instant, groove, budget, scenery: fire.scenery ?? null });
    onScene(null, null, null);
  }

  return {
    /**
     * Play `next` (null: back to the free show, letGo: the user's place and knights back
     * whatever the options; `instant` lets the look and framing go too). `ref`: its library ref ('b:…' | 'm:…'), `mode`
     * 'hold' | 'base' (default: the scene's own music), `instant`: no forming, blending or
     * impact (the Painter; the colors and the weapon at once), `flash`: the scenery changes
     * with a flash, `landed`: a swap just brought its weapon, flame and element (a drop's
     * strike, a phrase's impact), `groove`: the music is in the groove (the knights may dance
     * at once), `budget` the director's, `knights`: false leaves the knights to the moment
     * that called it (a drop: knightShow.drop reads the new overlay), `fresh`: a scene
     * arriving (every part again, the look's turn and the knights rolled anew; default:
     * unless it's an instant re-apply of the scene already playing: an edit, which touches
     * only the parts that changed; a scene only). Returns true if anything changed.
     * @param {Scene | null} next
     * @param {{ ref?: string | null, mode?: 'hold'|'base', instant?: boolean, flash?: boolean, landed?: boolean,
     *   groove?: boolean, budget?: number, knights?: boolean, fresh?: boolean }} [o]
     */
    apply(next, { ref: nextRef = null, mode: nextMode, instant = false, flash = false, landed = false, groove = false, budget = 1, knights: retake = true, fresh } = {}) {
      if (!next) {
        if (!scene) return false;
        letGo({ flash, instant, retake, groove, budget });
        return true;
      }
      const same = !!scene && (nextRef ?? `#${next.id}`) === (ref ?? `#${scene.id}`);
      const isFresh = fresh ?? (!instant || !same);
      if (!same) released.clear();
      scene = next;
      ref = nextRef;
      mode = nextMode === 'base' || nextMode === 'hold' ? nextMode : next.music === 'base' ? 'base' : 'hold';
      const hold = mode === 'hold';
      const parts = partsOf();
      const changed = (k) => isFresh || last[k] !== parts[k];
      let any = false;

      // 1. The overlay.
      if (changed('overlay')) { layers.set(overlay()); any = true; }
      // 2. The flame (registered under the scene's own key) and the scenery's colors.
      flameKey = sceneFlameKey(next, nextRef);
      if (changed('flame') || !colors.registered?.includes(flameKey)) colors.register(flameKey, next.colors.flame);
      if (changed('scenery') && !COLOR_KEYS.some((k) => released.has(k))) {
        colors.pinScenery(next.colors.scenery, { hold, seconds: instant ? 0.001 : 1.2 });
        any = true;
      }
      // 3. The weapon, flame and element, unless a swap just brought them: at once (instant),
      // otherwise with an impact where it stands (the same weapon: the flame lands with its
      // flash; another: it's there at once under it).
      if (!landed && changed('equip')) {
        const weapon = next.place.weapon ?? fire.weapon ?? null;
        // (An element the user has unchecked stays theirs to leave out: the one on the fire stays.)
        const element = sceneElement(next, user) ?? fire.element ?? undefined;
        const key = flameKey;
        if (weapon) {
          if (instant) Promise.resolve(fire.equip(weapon, key, { instant: true, element })).catch(noop);
          else {
            const first = weapon !== fire.weapon || fire.forging ? fire.equip(weapon, key, { instant: true, element }) : null;
            Promise.resolve(first).then(() => fire.equip(weapon, key, { element })).catch(noop);
          }
          any = true;
        }
      }
      // 4. The place.
      if (changed('place') && !released.has('scenery') && fire.scenery !== next.place.scenery) {
        fire.setScenery?.(next.place.scenery, { flash: flash && !instant });
        any = true;
      }
      // 5. The look.
      if (changed('look') && !released.has('looks')) { looks.pin(lookPin(), { hold, fresh: isFresh }); any = true; }
      // 6. The framing.
      if (changed('camera') && !CAMERA_KEYS.some((k) => released.has(k))) { camera.pin(cameraPin(next), { hold, move: 'cut' }); any = true; }
      // 7. The render, in this same frame.
      render.update?.(now());
      // 8. The knights: a hidden moment of their own (for an edit, the knights' show acts on
      // the changed settings by itself, at once).
      if (retake && isFresh) { knights.retake(fire.knights, { instant, groove, budget, scenery: fire.scenery ?? null }); any = true; }
      // 9. The fireflies: the show's pattern and how many fly lit.
      if (changed('fireflies')) {
        const pattern = next.fireflies.show;
        if (show && pattern !== 'mix' && pattern !== 'off' && show.pattern !== pattern) show.set(pattern);
        flies()?.setLit?.(litFor(next.fireflies.lit));
        any = true;
      }
      const arrived = !same || isFresh;
      last = parts;
      if (arrived) onScene(scene, ref, mode);
      return any || arrived;
    },
    /** The scene playing (null: the free show), its ref and how it plays. */
    get scene() { return scene; },
    get ref() { return ref; },
    get mode() { return mode; },
    /** Holding: the scene's flame key (the swaps forge in it); otherwise null (the show's). */
    get flameKey() { return scene && mode === 'hold' && !COLOR_KEYS.some((k) => released.has(k)) ? flameKey : null; },
    /** The flame key the scene registered, holding or not (null: no scene). */
    get sceneFlame() { return scene ? flameKey : null; },
    /**
     * A flame landed: does the scenery keep the scene's colors through it? The scene's own
     * flame does (unless the user took the colors back). Holding, landings leave the colors
     * alone anyway (colors.js held); this is for Base, whose arrival lands its own flame just
     * after its colors are pinned: without it, that landing would roll the show's colors over
     * the scene's before they'd shown. The show's own flames after it recolor as usual.
     * @param {string | null} key
     */
    keepsScenery(key) {
      return !!scene && !!key && key === flameKey && !COLOR_KEYS.some((k) => released.has(k));
    },
    /**
     * Holding: the scene's weapon and element (null: drawn by the show, as without a scene;
     * an element the user has unchecked is drawn from theirs too).
     */
    get weapon() { return scene && mode === 'hold' ? scene.place.weapon : null; },
    get element() { return scene && mode === 'hold' && !released.has('elements') ? sceneElement(scene, user) : null; },
    /** The scene's fire shape, added to the music's drive (zeros without one). */
    get offsets() { return scene ? scene.fire : NO_OFFSETS; },
    /** The fireflies' show pinned by the scene (null: the show's own patterns). */
    get flyShow() {
      const p = scene?.fireflies.show;
      return p && p !== 'mix' && p !== 'off' && !released.has('blink') ? p : null;
    },
    /** How fast the fireflies fly, as a share of their own speed (1 without a scene). */
    get flySpeed() { return scene ? scene.fireflies.speed : 1; },
    /**
     * Whether the scene holds a part now: 'place' | 'colors' | 'camera' | 'look' | 'render' |
     * 'knights' | 'fireflies' (false with no scene, or once the show has taken it back).
     * @param {string} part
     */
    holds(part) {
      if (!scene) return false;
      switch (part) {
        case 'place': return !released.has('scenery');
        case 'colors': return !!colors.held;
        case 'camera': return !!camera.held;
        case 'look': return !!looks.held;
        case 'render': return layers.over ? 'pixelSize' in layers.over || 'palette' in layers.over : false;
        case 'knights': return layers.over ? 'knights' in layers.over : false;
        case 'fireflies': return layers.over ? 'blink' in layers.over : false;
        default: return false;
      }
    },
    /**
     * The user touched these settings (the dialog, the P menu): theirs again until the next
     * scene. The camera's keys hand the framing back to the show, a layer's switch goes back
     * to the user's in the pinned look, 'looks' lets the look go, the color keys let the
     * scenery's colors go.
     * @param {string[]} keys
     */
    release(keys) {
      if (!scene || !Array.isArray(keys)) return;
      for (const k of keys) released.add(k);
      layers.release(keys);
      if (keys.some((k) => CAMERA_KEYS.includes(k)) && camera.pinned) camera.pin(null);
      if (keys.some((k) => COLOR_KEYS.includes(k))) colors.release();
      if (keys.includes('looks')) { if (looks.pinned) looks.pin(null); }
      else if (keys.some((k) => Object.hasOwn(LAYERS, k)) && looks.pinned) looks.pin(lookPin(), { hold: mode === 'hold', fresh: false });
      // (Re-applying this scene leaves what the user took back alone.)
      last = { ...last, overlay: JSON.stringify(overlay()), look: JSON.stringify([lookPin(), mode]) };
    },
  };
}
