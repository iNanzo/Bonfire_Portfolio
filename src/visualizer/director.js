// @ts-nocheck: 7 type errors still to fix (tsconfig.json checks every module; delete this line once tsc is clean here).
// Music → bonfire. Each frame the director turns the analyser's features into the
// scene's live `drive` (continuous), its `glitch` layer and its camera, and into events
// (beats, bars, sections):
//
//   drive     bass swells the fire and its light, the kick envelope punches its height,
//             size and glow, mids and highs stir the turbulence, and the wind throws
//             the flames one way and the other on alternate beats.
//   beats     every beat the fire kicks, the ball crackles or the ice pulses, as hard as
//             the kicks have been landing; the planted blade glows (and shudders on the
//             hard ones). Each bar echoes its silhouette. In a breakdown the grid keeps
//             going, so a held blade still throbs on the beat.
//   fireflies a light show (fireflyShow.js): flash patterns that change every 8 bars,
//             a slow swell and a swirl around the fire or the held blade in breakdowns,
//             all flashing together right after a drop. They move to the beat too
//             (fireflyMoves.js): swinging, bouncing, darting, round the compass…
//   hats      throw sparks.
//   rings     every few bars the current element's ring races out, no swap needed.
//   phrases   every N bars (a setting) the fire takes a new weapon, flame and element,
//             the swap paced so its impact lands exactly on the next phrase's downbeat.
//   breakdown the bass drops out: a new weapon is forged and held over the fire in a
//             vortex of particles that tightens with the build-up, swaying and trembling
//             as if alive, while the camera closes in and the picture starts to tear...
//   drop      ...and it strikes when the bass comes back: the vortex flung out, the ring
//             racing across the ground, a zoom punch, a shake, the look's burst and a few
//             drop hits. With nothing held, the drop recolors the fire at once.
//   blade     every 8 bars (a setting), and two bars after a big drop, the blade pulls
//             itself out of the fire and fights on its own for a bar or more: slashes,
//             thrusts and spins landing on the beats (bladeMotion.js), with rests and
//             flourishes, then it plunges back in on a downbeat, throwing a ring. The
//             camera covers it with close angles cut between moves, or follows, rides,
//             tracks or orbits it.
//   camera    shots around the clearing, each with its own move, cut every couple of bars
//             and every bar right after a drop, by a cut, a whip pan or a glide; a zoom
//             punch on each kick (camera.js).
//   looks     the picture's effects take turns (looks.js), a new one every 16 bars and
//             after each drop, with layers coming and going over them (mirror,
//             scanlines, ghosting, glow, a gradient map, a repaint…, each blending its
//             own way); each has its own burst for the big hits, and every drop throws a
//             few more drawn at random. Breakdowns letterbox and close an iris around the
//             fire as the build rises; the drop snaps it open.
//   switches  every effect is off, in the mix, or always (looks.js MODES). In the mix it
//             comes and goes: each look's turn re-rolls which are on (looks.active).
//   knights   the knights by the fire (knightShow.js): they rest and nod along before a
//             drop, watch the blade forged in a breakdown, get up as the build peaks, leap
//             into the dance on the drop (Praise the Sun!) and dance the groove round the
//             fire in formations while the energy holds, then sit back down on a phrase
//             line. They come and go only where it's hidden: the start, a drop's flash, a
//             new scenery, where their armor's shine and their reactions are rolled too.
//             The cuts visit the dancers now and then (with Knight Cameras).
//   render    the Render tab (render.js): pixel size, dither, outlines, the palette, fog,
//             shadows, the flame's frame rate, how hits land; outlines come and go, the
//             palette drops to a few colors, the pixel size jumps with looks and drops, and
//             now and then a bar flips to an x-ray of the picture's passes.
//   colors    each new flame is one of the site's palettes, or one made on the spot
//             (colors.js), maybe with new scenery colors to match.
//   feel      bright music (strong highs) cools the picture and dark music warms it
//             (color temperature); the sub-bass makes the fire and the view breathe.
//   build-ups climb in stages (a quarter, a half, three quarters, the last stretch), each
//             a notch more: pulses, a look burst, a ring, then sparks and tremors; right
//             before the drop hits, the screen goes black for a beat of silence.
//   budget    how much is going on follows the song's shape: calm in an intro or a
//             breakdown, busy in the groove, everything in the bars after a drop.
//   scenes    preset scenes (the Scenes tab; made in the Bonfire Painter) take turns with
//             the free show (sceneLoop.js: in turn or shuffled, every N bars or on drops,
//             in the mix now and then a stretch of the free show). A scene is played by the
//             scene player (scenePlayer.js): everything reads the settings through a layer
//             the scene lays its own over (layered.js), and its look, framing and colors are
//             pinned in their own modules (looks.js pin, camera.js pin, colors.js
//             register/pinScenery). It changes only where it's hidden: at the music's start;
//             at a drop (the blade forged in the breakdown is the next scene's weapon in its
//             flame and element, and the scene lands in the strike's flash; a breakdown that
//             ends with no drop strikes that blade in the colors of the scene playing, and
//             the next one waits for a real drop); on a phrase line
//             (the swap is forged with the next scene's weapon and flame and the scene lands
//             with its impact on the downbeat; with the forge busy, or the same weapon, a
//             flash on the downbeat instead); and by hand (N) on the next downbeat, with a
//             flash (a blade held for the drop keeps it for the drop's strike: nothing lands
//             between a breakdown's forge and its drop). While a scene holds: no phrase
//             swaps, scenery mix or camera cuts, the swaps forge its own flame (and weapon and
//             element, if it sets them and the user's Elements allow it), the look timer
//             only re-rolls what it leaves to the dice, the fireflies keep its show,
//             its fire shape is added to the drive and its drop hits are the drop's. Its
//             knights arrive in the same moment (knightShow.js retake). A pinned look shows
//             at its painted strength even in silence (under reduced motion, only its still
//             parts, held still: scenePlayer.js).
import { drawnWeapons } from '../content.js';
import { elements } from '../elements.js';
import { effects } from '../effects.js';
import { MOVES } from '../bonfire/bladeMotion.js';
import { createFireflyShow } from './fireflyShow.js';
import { createFireflyMoves, FLY_MOVES } from './fireflyMoves.js';
import { createLooks, LOOKS, DROP_FX, LAYERS, MIRRORS } from './looks.js';
import { createRenderShow, XRAY_VIEWS } from './render.js';
import { createKnightShow, KNIGHT_MOVES, HELMETS } from './knightShow.js';
import { createCamera, CLOSE, WIDE, COMBO_SHOTS, SWING_CAMS, HOLD_CAMS } from './camera.js';
import { SWING_EASES } from './cameraEase.js';
import { createBarClock } from './bars.js';
import { createColors } from './colors.js';
import { createLayered } from './layered.js';
import { createScenePlayer, sceneElement, sceneFlameKey } from './scenePlayer.js';
import { createSceneLoop } from './sceneLoop.js';
import { modeOf } from './looks.js';
import { SCENERIES } from '../bonfire/scenery.js';
import { approach, pick, TAU } from '../math.js';

const all = (names) => Object.fromEntries(Object.keys(names).map((k) => [k, true]));
const every = (mode, names) => Object.fromEntries(Object.keys(names).map((k) => [k, mode]));

// Effect switches take a mode: 'off' | 'mix' (comes and goes, re-rolled each look) | 'on'.
export const DEFAULT_SETTINGS = {
  sensitivity: 1, // onset thresholds (higher catches softer kicks)
  reactivity: 1.2, // how hard the fire answers
  offset: 40, // ms: beats this early, for render/display latency
  particles: 'more', // normal | more | max
  sparks: 'on', // hats throw sparks
  blink: true, // fireflies blink and move on the beat
  flyMoves: all(FLY_MOVES),
  flyBars: 8, // a new firefly move every N bars
  autoDrops: true, // forge in breakdowns, strike on the drop
  phraseBars: 16, // a new weapon every N bars (0: only on drops)
  ringBars: 4, // an extra ring every N bars (0: never)
  echo: 'on', // the blade's silhouette echoes out on every bar
  combos: 8, // the blade leaves the fire every N bars (0: only after drops, -1: never)
  comboBars: 0, // bars it stays out (0: 1, 2 or sometimes 4)
  moves: all(MOVES),
  rhythm: 'varied', // beats: a move on every beat | varied: rests, and doubles at slow tempos
  alive: true, // flourishes, a shudder on hard beats, a held blade's sway
  colors: 'site', // site | harmonious | wild | mix (colors.js)
  scheme: 'auto',
  sceneColors: 'mix', // a new flame brings scenery colors of its own (mix: some flames)
  camera: 'cuts', // still | drift | cuts
  cutBars: 2,
  transition: 'mix', // cut | whip | glide | mix
  swingCam: 'mix', // how the camera covers the blade out of the fire (camera.js SWING_CAMS)
  swingEase: 'mix', // ...and how it eases while it does (cameraEase.js SWING_EASES; mix: per combo, now and then per move)
  holdCam: 'mix', // ...and a blade held for the drop (HOLD_CAMS)
  punch: 'on', // zoom punch on kicks, shake on the big hits
  shot: 'clearing',
  glitch: 1, // 0..2: how strong the looks' effects are
  looks: every('mix', LOOKS), // mix: takes turns; on: always, under the one taking its turn
  lookBars: 16, // a new look every N bars (0: only after drops)
  ...every('mix', LAYERS), // scanlines, mirror, blend modes, ghosting, motion blur, glow, gradient map, painterly, watercolor, flicker
  mirrors: all(MIRRORS), // which kinds of mirror (horizontal, vertical, quarter)
  flash: 'on', // a negative flash on drops
  temperature: 'on', // bright music cools the picture, dark music warms it
  breathe: 'on', // the sub-bass makes the fire and the view swell
  stages: true, // build-ups climb in stages
  blackout: 'on', // a black frame of silence right before the drop
  budget: true, // effects follow the song's shape (calm intros, all-out after drops)
  scenery: 'ruins', // where the fire burns: ruins | forge | shrine | mix (a new place every other big drop)
  dropFx: every('mix', DROP_FX), // mix: drawn at random; on: every drop
  dropCount: 2, // up to this many drop hits at once
  elements: { fire: true, lightning: true, ice: true },
  title: '',
  subtitle: '',
  titleOnDrop: true,
  // The Render tab (render.js): the pixel pass and the scene, as on the site to begin with.
  pixelSize: 4, // CSS px per pixel
  pixelShift: 'mix', // the pixel size jumps with a look and on drops
  dither: effects.render.dither, // 0..0.4
  ditherMatrix: '4', // '4' | '8' | 'mix' (a pick with each look)
  outlines: 'mix', // the outlines come and go
  palette: 'flame', // flame | ashen | moonlit (render.js PALETTES)
  fewColors: 'mix', // the palette drops to a few colors (rolled which)
  vignette: effects.render.vignette,
  exposure: effects.render.exposure,
  fog: 'light', // off | light | thick | mix
  shadows: true, // the fire's shadow
  flameFps: effects.fire.fps, // the flame's frame rate (8, 12, 24, 60)
  colorChange: effects.render.colorChange, // seconds a new flame's colors take to blend in
  xray: 'mix', // now and then a bar flips to one of the picture's passes
  xrayViews: all(XRAY_VIEWS),
  hitStop: 'on', // big hits freeze the picture for a few frames
  hitFlash: 'on', // ...flash it toward the flame's core
  debris: 'on', // ...throw debris
  marks: 'on', // ...and mark the ground
  trails: true, // the fireflies' light trails (a rebuild)
  // The Knights tab (knightShow.js).
  knights: 'mix', // by the fire: off | mix (coming and going where it's hidden) | on
  knightCount: 'random', // how many: 1-4, or random (rolled each time they come in)
  knightDance: 'mix', // off (they sit) | mix (at the right moments) | on (whenever the groove is locked)
  knightFormation: 'mix', // ring | line | solo | canon | mix (a new one each dance)
  knightMoves: all(KNIGHT_MOVES),
  knightHelmets: all(HELMETS),
  danceBars: 4, // a new move every N bars
  knightCam: 'mix', // the cuts visit the dancers (mix: some dances)
  knightSummon: 'mix', // on the drop they're up and in place in its flash (mix: some drops)
  knightGestures: 'mix', // Praise the Sun and the like on drops (mix: some drops)
  knightShine: 'mix', // the fire's reflection sweeping over their armor (mix: rest and flare sweeps rolled apart)
  knightReactions: 'mix', // they flinch, lean, hop and watch the blade (mix: rolled at the hidden moments)
  knightStyle: 'site', // how they're drawn and built (knightStyles.js STYLES; site: the site's own); mix: rolled at the hidden moments
  knightFinish: 'mix', // the armor's steel (steel.js FINISHES), one for the whole cast; mix: rolled at the hidden moments
  knightGlow: 'mix', // Edge Glow: off | mix (some stretches, a strength rolled round knightRim at the hidden moments) | on (knightRim)
  knightRim: 0.5, // 0..1: how strongly the armor's edges catch the fire's color (Edge Glow's strength)
  knightSeat: 'mix', // how they sit: resting | watchful | mix (rolled at the hidden moments)
  // Preset scenes (the Scenes tab; the scene loop and player, layered.js).
  scenes: 'mix', // off | mix (scenes come and go, with stretches of the free show) | on
  sceneFrom: 'both', // both | builtin | mine
  sceneOrder: 'turn', // turn (the library's order) | shuffle (every scene before a repeat)
  sceneBars: 32, // a new scene every N bars (0: only on drops; bars.js)
  sceneHold: 'scene', // scene (each scene's own) | hold | base
  sceneList: {}, // { 'b:id' | 'm:id': false }: out of the loop (missing: in)
  sceneCards: 'off', // a title card with the scene's name as it arrives: off | mix | on
};

/** @typedef {import('./sceneLoop.js').SceneEntry} SceneEntry */
/** @typedef {import('../scenes.js').Scene} Scene */

/**
 * The director. `scenes()`: every preset scene there is, in order, as library entries
 * ({ ref: 'b:<id>' built in | 'm:<id>' mine, scene }); the loop filters them (Scenes From,
 * The Loop, the admin's hidden ones). Without it there are none (the Painter plays its one
 * scene by hand: scene()). `reducedMotion`: no shake, no moving looks or layers (a scene's
 * look plays its still parts only, scenePlayer.js), no dances. `paintedLook` (the Painter):
 * a scene's look plays as painted under reduced motion too, since it's what's being painted,
 * but still: it answers no beat, hat or hit (looks.js's reduced motion), the palette never
 * cycles, and the bonfire's own `paintedLook` keeps what flashes or jitters off (stillFx.js).
 * @param {any} fire the bonfire (scene.js createBonfire)
 * @param {{ settings: Record<string, any>, onEvent?: (name: string, data?: any) => void, reducedMotion?: boolean,
 *   paintedLook?: boolean, scenes?: () => SceneEntry[] }} o
 */
export function createDirector(
  fire,
  { settings: base, onEvent = () => {}, reducedMotion = false, paintedLook = false, scenes = () => [] },
) {
  // Everything reads the settings through a layer a preset scene can lay its own over
  // (layered.js); writes (and saving) go to the user's.
  const layers = createLayered(base);
  const settings = layers.view;
  const d = fire.drive;
  const g = fire.glitch;
  let presence = 0; // 0 silent → 1 music playing
  let kickEnv = 0; // the latest beat/kick, decaying
  let punch = 0; // zoom punch
  let windKick = 0;
  let beatSign = 1;
  let windPhase = 0;
  let lastLit = -1;
  let lastPeriod = 0;
  let pendingSync = null; // { beats } a synced swap to start on the next downbeat
  let heldSince = -1;
  let wantArm = false; // a breakdown wants a blade forged as soon as the fire is free
  let phase = 'rest'; // rest | groove | breakdown (for the HUD)
  let heard = 'silent'; // the analyser's section as of the last frame: silent | groove | breakdown | build
  let lastBeat = null;
  let sinceDrop = Infinity; // bars since the last drop
  let swingCam = null; // how the camera covers the blade while it's out
  let swingEase = 'smooth'; // ...and the feel of its moves (cameraEase.js)
  let temp = 0; // color temperature, -1 warm … 1 cool (eased)
  let breath = 0; // the sub-bass swell (eased)
  let stage = 0; // how far the build-up has climbed (0–4)
  let dropAt = -1; // (performance time) a drop waiting out its blackout
  let dropBig = true; // ...and whether it's a big one (a small one, a short cut coming back, brings no scene)
  let budget = 0.6; // 0..1: how much the effects may do right now (the song's shape)
  let bigDrops = 0; // (for the scenery mix: a new place every other big drop)
  let lastHits = null; // the last drop's hits, by name (the stats overlay's), and when they were thrown
  let lastHitsAt = 0;
  const clock = createBarClock(settings); // the "every N bars" settings, rolled when on Random (bars.js)
  const show = createFireflyShow({ reducedMotion });
  const flyMoves = createFireflyMoves({ reducedMotion });
  const looks = createLooks(g, { reducedMotion });
  const render = createRenderShow(fire, settings, { looks, reducedMotion });
  const colors = createColors(settings);
  const knights = createKnightShow(settings, { clock, reducedMotion });
  const camera = createCamera(fire, settings, { reducedMotion, onShot: (name) => onEvent('shot', { name }) });
  // Preset scenes: the loop (which, when) and the player (how).
  const loop = createSceneLoop(settings, { library: scenes, clock });
  const player = createScenePlayer(fire, {
    layers,
    looks,
    colors,
    camera,
    knights,
    render,
    show,
    user: base,
    effects,
    reducedMotion,
    paintedLook,
    onScene: (sc, ref, mode) => {
      arrivedAt = now();
      loop.arrived();
      onEvent('scene', { name: sc?.name ?? null, ref, mode });
    },
  });
  /**
   * A scene waiting for its moment: `how` 'drop' (armed in a breakdown: it lands in the
   * strike), 'phrase' (its swap is forging: it lands with the impact of `flame`), 'beat' (on
   * the downbeat of bar `at`, -1: the next one, with a flash). `entry` 'free': the free show.
   * @type {{ entry: SceneEntry | 'free', how: 'drop'|'phrase'|'beat', at?: number, flame?: string, until?: number } | null}
   */
  let pending = null;
  let armedFor = null; // the scene the blade held for the drop was forged for
  let armedFlame = null; // ...and the flame it carries
  /** @type {{ at: string, flame: string, weapon: string | null, element: string | null, scene: Scene | null } | null} */
  let recolor = null; // a struck blade's impact (flame `at`) takes the scene's own flame (recolorFor)
  let arrivedAt = -Infinity; // when the scene playing arrived (s): the show's cuts leave its framing a bar
  let handPicked = false; // the scene playing was picked by hand (N, Play Now, ?scene=), not dealt by the loop
  let lastFlySpeed = 1;
  const GROOVE_SHOWS = ['blink', 'species', 'chase', 'twinkle'];
  const DROP_AHEAD = 8; // bars from a breakdown's forge to its drop, about
  let wasLow = false;
  let beatAt = 0; // the last beat's grid time and count, for a continuous beat position
  let beatCount = 0;
  let kBeat = 0; // the knights' beat position: the grid's, eased through small jumps
  const now = () => performance.now() / 1000;
  // (A scene holding the framing: no cuts, rigs or covering shots.)
  const moving = () => settings.camera !== 'still' && !camera.held;
  /** An effect switch is on right now (always, or in the mix and rolled on for this look). */
  const on = (key) => looks.active(key, settings[key]);
  const lookName = () => looks.playing.map((k) => LOOKS[k]).join(' + ');

  // --- choosing the next fire -----------------------------------------------------------
  // (While a scene holds, its flame, and its weapon and element if it sets them.)
  const weaponKeys = drawnWeapons();
  function nextElement(prefer, { user = false } = {}) {
    if (!prefer && !user && player.element) return player.element;
    const on = Object.keys(settings.elements).filter((id) => settings.elements[id]);
    if (prefer && on.includes(prefer)) return prefer;
    const pool = on.length ? on : ['fire'];
    const total = pool.reduce((s, id) => s + (elements[id]?.weight ?? 1), 0);
    let r = Math.random() * total;
    for (const id of pool) {
      r -= elements[id]?.weight ?? 1;
      if (r < 0) return id;
    }
    return pool.at(-1);
  }
  const nextFlame = (step = 0) => (!step && player.flameKey) || colors.next(fire.flame, step);
  const nextWeapon = () => player.weapon ?? pick(weaponKeys.filter((k) => k !== fire.weapon));
  /**
   * What a swap forges to bring `target` (a library entry, or 'free': the show's own): its
   * weapon (null: drawn, never the one in the fire), flame (registered now) and element.
   * @param {SceneEntry | 'free'} target
   */
  function equipFor(target) {
    if (target === 'free') {
      return {
        weapon: pick(weaponKeys.filter((k) => k !== fire.weapon)),
        flame: colors.next(fire.flame),
        element: nextElement(undefined, { user: true }),
      };
    }
    const sc = target.scene;
    const flame = sceneFlameKey(sc, target.ref);
    colors.register(flame, sc.colors.flame);
    return {
      weapon: sc.place.weapon ?? pick(weaponKeys.filter((k) => k !== fire.weapon)),
      flame,
      element: sceneElement(sc, base) ?? nextElement(undefined, { user: true }),
    };
  }

  // --- the moves ------------------------------------------------------------------------
  /** Recolor on the spot: same weapon, new flame and element, the ring right now. */
  function hit({ element, step = 0 } = {}) {
    if (fire.forging) return false;
    fire.equip(fire.weapon, nextFlame(step), { element: nextElement(element) }).catch(() => {});
    bang(0.7);
    return true;
  }
  /**
   * Forge a new weapon and hold it over the fire until strike(). With a scene change coming at
   * the drop (sceneLoop.js dropDue: half a stretch played by then), it's the next scene's
   * weapon, flame and element; nothing is dealt yet (peek): the drop deals it, if it's a drop
   * and the scene playing has had its quarter (strike). A scene holding the same weapon as
   * the one in the fire has nothing to forge: the drop recolors on the spot instead (hit()).
   */
  function arm() {
    if (fire.forging) return false;
    recolor = null;
    // (The drop is some 8 bars off: a breakdown and a build.)
    if (!pending && loop.dropDue(DROP_AHEAD)) {
      const next = loop.peek();
      if (next) pending = { entry: next, how: 'drop' };
    }
    const eq =
      pending?.how === 'drop'
        ? equipFor(pending.entry)
        : { weapon: nextWeapon(), flame: nextFlame(), element: nextElement() };
    if (eq.weapon === fire.weapon) return true;
    armedFor = pending?.how === 'drop' ? pending.entry : null;
    armedFlame = eq.flame;
    fire.equip(eq.weapon, eq.flame, { element: eq.element, hold: true }).catch(() => {});
    heldSince = now();
    if (moving()) {
      const how = settings.holdCam === 'mix' ? pick(Object.keys(HOLD_CAMS)) : settings.holdCam;
      camera.cut(how === 'close' ? pick(CLOSE) : how, { bars: 32 });
    }
    onEvent('arm');
    return true;
  }
  /**
   * The drop: a held weapon strikes; otherwise the fire recolors at once. A scene change due
   * lands in its flash, before the knights hear of the drop, so they take its places: the one
   * the breakdown forged for (dealt now, once the scene playing has had a quarter of its
   * stretch: sceneLoop.js dropReady), any scene waiting for a downbeat, or the loop's next if
   * this drop is its moment. `drop` false: a held blade striking with no big drop (the energy
   * crept back, a small drop, or it was held too long): no scene is dealt, the one forged for
   * stays next.
   * A held blade that wasn't forged for the scene playing after the strike (the one it was
   * forged for didn't come, one was picked by hand since, or one arrives that had no blade)
   * takes that scene's flame, weapon and element with its impact (landed(): recolor).
   */
  function strike({ title = true, drop = true } = {}) {
    let target;
    if (pending?.how === 'drop') {
      if (drop && loop.dropReady()) target = loop.advance() ?? undefined;
    } else if (pending) target = pending.entry;
    else if (drop && loop.dropDue() && loop.dropReady()) target = loop.advance() ?? undefined;
    const held = fire.holding;
    const own = held && target !== undefined && armedFor === target; // (the blade forged for it)
    // (The free show coming back with nothing held: it's back first, so the drop's recolor is its own.)
    const freeFirst = target === 'free' && !held;
    if (freeFirst) play('free', { flash: true, knights: false });
    const struck = fire.release(3) || (target && target !== 'free' ? true : hit());
    if (!struck && !freeFirst) return false;
    pending = null;
    heldSince = -1;
    sinceDrop = 0;
    render.drop();
    // (With a blade striking, the scene's own equipment waits for its impact: an equip now
    // would cut the strike short.)
    if (target !== undefined && !freeFirst) play(target, { landed: held, flash: true, knights: false });
    recolor = held && !own ? recolorFor(armedFlame, target !== undefined, armedFor) : null;
    armedFor = null;
    // With the scenery mix, every other big drop lands somewhere new (first, so the knights
    // take their places there). (Not while a scene holds the place.)
    if (settings.scenery === 'mix' && !player.holds('place') && ++bigDrops % 2 === 0)
      fire.setScenery(pick(Object.keys(SCENERIES).filter((k) => k !== fire.scenery)));
    // The knights: who's here is rolled in this flash, and they leap into the dance.
    knights.drop(fire.knights, 'big', { budget: 1, scenery: fire.scenery });
    // (With knights dancing, a wide that shows them: not the long lens, and with Knight
    // Cameras on for this dance, maybe the dancers' own.)
    const wide = knights.dancing
      ? [...WIDE.filter((n) => n !== 'tele'), ...(knights.camOn ? ['dancersWide'] : [])]
      : WIDE;
    if (moving() && (target === undefined || target === 'free')) camera.cut(pick(wide), { bars: 4, move: 'cut' }); // (a scene arriving opens on its own framing)
    bang(1);
    dropHits();
    onEvent('drop', { title });
    return true;
  }
  /** An extra ring from the fire, no swap. */
  function ring(strength = 1) {
    if (fire.forging && !fire.holding) return false;
    fire.ring(strength);
    bang(0.45 * strength);
    return true;
  }
  /** The big-hit package: zoom punch, shake, the look's burst, fireflies scatter, maybe a negative flash. */
  function bang(amount = 1) {
    if (on('punch')) {
      punch = Math.max(punch, 0.6 * amount);
      fire.shake(0.3 * amount);
    }
    if (!reducedMotion) looks.bang(amount, { flash: on('flash') });
    fire.fireflies?.dance(0.9 * amount, { dir: beatSign, lift: 0.6 * amount });
  }
  /** A drop's extra hits, drawn from those switched on. */
  function dropHits() {
    if (reducedMotion || !settings.glitch) return;
    const names = looks.drop(settings.dropFx, Math.max(1, Math.round(settings.dropCount * (0.5 + 0.5 * budget))));
    if (names.includes(DROP_FX.xray)) render.xrayHit(now(), lastPeriod);
    if (names.length) {
      lastHits = names;
      lastHitsAt = now();
      onEvent('dropfx', { names });
    }
  }
  /**
   * A full swap timed so the impact lands `beats` beats after the beat at `from` (grid
   * time), `lead` early like every beat. Paced to the time actually left, so a late frame
   * doesn't make it land late.
   */
  function forgeIn(
    beats,
    period,
    from = now(),
    eq = { weapon: nextWeapon(), flame: nextFlame(), element: nextElement() },
  ) {
    if (fire.forging) return false;
    const left = from + beats * period - settings.offset / 1000 - now();
    const pace = Math.min(1.8, Math.max(0.55, fire.swapTime / Math.max(0.1, left)));
    fire.equip(eq.weapon, eq.flame, { element: eq.element, pace }).catch(() => {});
    return true;
  }
  /** How many beats a synced swap takes at this tempo: the power of two closest to its natural length. */
  function swapBeats(period) {
    let best = 8;
    let bestErr = Infinity;
    for (const n of [4, 8, 16]) {
      const err = Math.abs(Math.log(fire.swapTime / (n * period)));
      if (err < bestErr) {
        bestErr = err;
        best = n;
      }
    }
    return best;
  }
  /** Queue a synced swap: it starts on a downbeat and lands on the downbeat after. */
  function forgeOnBeat(period) {
    if (!period) return forgeIn(8, 60 / 124);
    pendingSync = { beats: swapBeats(period) };
    return true;
  }

  // --- preset scenes --------------------------------------------------------------------
  /** How a scene plays: the settings' With the Music (hold | base), or each scene's own. */
  const modeFor = (sc) =>
    base.sceneHold === 'hold' || base.sceneHold === 'base' ? base.sceneHold : sc.music === 'base' ? 'base' : 'hold';
  const musicOn = () => presence > 0.5 && phase !== 'rest';
  /**
   * Play `target` now (a library entry; 'free' or null: the free show) through the player
   * (scenePlayer.js apply: its options), in the moment that called it.
   * @param {SceneEntry | 'free' | null} target
   */
  function play(target, { landed = false, flash = false, instant = false, knights: retake = true, mode, fresh } = {}) {
    const entry = target && target !== 'free' ? target : null;
    const sc = entry?.scene ?? null;
    return player.apply(sc, {
      ref: entry?.ref ?? null,
      mode: sc ? (mode ?? modeFor(sc)) : undefined,
      instant,
      flash,
      landed,
      fresh,
      groove: phase === 'groove' && presence > 0.5,
      budget,
      knights: retake,
    });
  }
  /** The scene waiting for a downbeat lands now, with a flash (the swaps' impact where it stands). */
  function playOnBeat(p) {
    pending = null;
    const was = player.scene;
    play(p.entry, { flash: true });
    // (The free show arriving brings no impact of its own: the fire recolors on the spot, its
    // own impact and flash, or with a swap under way, a ring.)
    if (was && p.entry === 'free') {
      if (!hit()) {
        fire.puff(0.6);
        ring(0.8);
      }
    } else bang(0.8);
  }
  /**
   * What a held blade struck in flame `at` should wear at its impact instead, for the scene
   * playing now: its flame (the one it registered if it `arrived` in this strike; if it was
   * already playing, while it holds its colors), with its weapon and element if it sets them.
   * A blade `forged` for a scene that didn't come never shows that scene's colors: with the
   * show's colors in play (the free show, a Base scene), it takes the show's next flame. Null:
   * nothing to change (the blade's flame is right).
   * @param {string | null} at
   * @param {boolean} arrived
   * @param {SceneEntry | 'free' | null} forged
   */
  function recolorFor(at, arrived, forged) {
    if (!at) return null;
    const sc = player.scene;
    let flame = sc ? (arrived ? player.sceneFlame : player.flameKey) : null;
    if (!flame && forged && forged !== 'free' && forged.scene !== sc) flame = colors.next(at);
    if (!flame || flame === at) return null;
    return { at, flame, weapon: sc?.place.weapon ?? null, element: sceneElement(sc, base), scene: sc };
  }
  /** A library entry for what scene() was handed: an entry, a bare scene (with `ref`), or null. */
  const entryOf = (x, ref = null) => (!x ? null : x.scene ? x : { ref, scene: x });

  // --- the living blade -----------------------------------------------------------------
  /** Cut to a way of covering the blade ('angles': another close angle). */
  function swingShot(how, move) {
    const name = how === 'angles' ? pick(Object.keys(COMBO_SHOTS).filter((n) => n !== camera.shot)) : how;
    camera.cut(name, { bars: 1, move, ease: swingEase });
  }
  /** A feel for the swing camera: the setting, or with mix, another than the last. */
  function pickEase() {
    if (settings.swingEase !== 'mix') return SWING_EASES[settings.swingEase] ? settings.swingEase : 'smooth';
    return pick(Object.keys(SWING_EASES).filter((k) => k !== swingEase));
  }
  /**
   * The blade leaves the fire from the beat at `from` (grid time): it rises on the next
   * beat, a move lands on each beat after (every other beat when the tempo is very fast;
   * with a varied rhythm, some rests and, at slow tempos, a double on the half beat), and
   * it plunges back in on the last, a downbeat.
   */
  function combo(period, from) {
    if (fire.forging || !period) return false;
    const lead = settings.offset / 1000;
    const step = period < 0.33 ? period * 2 : period;
    const bars = settings.comboBars || pick([1, 1, 2, 2, 4]);
    const beats = Math.max(2, Math.round((bars * 4 * period) / step));
    const t0 = from - lead - now();
    const varied = settings.rhythm === 'varied';
    const hits = [];
    let rested = true; // (the first beat is the rise)
    for (let k = 1; k < beats; k++) {
      const at = t0 + k * step;
      if (varied && !rested && k < beats - 1 && Math.random() < 0.2) {
        rested = true;
        continue;
      }
      if (varied && !rested && step / 2 >= 0.3 && Math.random() < 0.15) hits.push(at - step / 2);
      rested = false;
      hits.push(at);
    }
    if (!hits.length || hits[0] < 0.3) return false;
    swingCam = moving() ? (settings.swingCam === 'mix' ? pick(Object.keys(SWING_CAMS)) : settings.swingCam) : null;
    swingEase = pickEase();
    if (swingCam) swingShot(swingCam, 'cut');
    fire
      .swing({
        hits,
        plunge: t0 + beats * step,
        moves: settings.moves,
        alive: settings.alive,
        basis: camera.axes,
        // Between moves: another close angle, or now and then another way of covering it.
        // (The cut lands before the move takes its plane from the camera.)
        onMove: (k) => {
          if (!k || !swingCam) return;
          // Now and then the next piece of the combo moves with another feel.
          if (settings.swingEase === 'mix' && Math.random() < 0.35) swingEase = pickEase();
          if (swingCam === 'angles') swingShot('angles', Math.random() < 0.5 ? 'cut' : 'whip');
          else if (settings.swingCam === 'mix' && Math.random() < 0.3) {
            swingCam = pick(Object.keys(SWING_CAMS).filter((n) => n !== swingCam));
            swingShot(swingCam, 'whip');
          }
        },
        onHit: (k, kind) => {
          punch = Math.max(punch, kind === 'slash' ? 0.3 : 0.5);
          knights.near(fire.knights, fire.blade?.tip); // (a knight close by flinches)
        },
      })
      .then((ok) => {
        swingCam = null;
        if (!ok) return;
        bang(0.9);
        if (moving()) camera.cut(pick(WIDE), { bars: 4 });
      });
    onEvent('combo');
    return true;
  }
  /** The blade out as soon as possible: the next beat far enough off starts it. */
  function comboSoon(period) {
    if (!period || !lastBeat) return false;
    let from = lastBeat.time;
    while (from + period - settings.offset / 1000 - now() < 0.3) from += period;
    return combo(period, from);
  }
  /** A burst in the current look on demand. */
  function glitchHit() {
    if (!reducedMotion) looks.bang(1);
    punch = Math.max(punch, 0.3);
  }

  /**
   * The music stopped, or was taken away (a new source, the start screen): back to rest,
   * no drop or forge waiting, the knights sat down.
   */
  function silence() {
    phase = 'rest';
    wantArm = false;
    dropAt = -1;
    stage = 0;
    knights.silence(fire.knights);
    // (A scene waiting for a downbeat that won't come lands now.)
    if (pending?.how === 'beat') {
      const p = pending;
      pending = null;
      play(p.entry, { flash: true });
    }
  }

  // --- per frame ------------------------------------------------------------------------
  function update(f, dt) {
    const live = f.state !== 'silent';
    heard = f.state;
    presence = approach(presence, live ? 1 : 0, live ? 0.4 : 1.5, dt);
    const r = settings.reactivity * presence;
    const b = f.bands;
    const hi = Math.max(b.highMid, b.high);
    kickEnv *= Math.exp(-dt / 0.14);
    punch *= Math.exp(-dt / 0.12);
    windKick *= Math.exp(-dt / 0.25);
    const period = f.bpm ? 60 / f.bpm : 0;
    if (period) lastPeriod = period;
    fire.alive = settings.alive;

    // The blackout before a drop, then the drop itself.
    g.blackout = dropAt > 0 ? 1 : 0;
    if (dropAt > 0 && now() >= dropAt) {
      dropAt = -1;
      g.blackout = 0;
      strike({ drop: dropBig });
    }

    // Feel: brightness → color temperature, sub-bass → breathing.
    const bright = (b.highMid + b.high) / 2 - (b.bass + b.lowMid) / 2; // -1 (dark) … 1 (bright)
    temp = approach(temp, on('temperature') ? Math.max(-1, Math.min(1, bright * 1.6)) * presence : 0, 1.5, dt);
    g.temp = temp;
    breath = approach(breath, on('breathe') ? b.bass * presence : 0, 0.45, dt);

    // The budget: what the song's shape allows right now.
    const after = sinceDrop < 8 ? 1 - sinceDrop / 8 : 0; // the bars after a drop, fading
    const shape = phase === 'rest' ? 0.3 : phase === 'breakdown' ? 0.35 + 0.5 * f.build : 0.55 + 0.25 * f.level;
    budget = settings.budget ? Math.min(1, Math.max(shape, 0.6 + 0.4 * after)) : 1;
    if (settings.budget && phase === 'rest') budget = 0.3;

    // Sections first: a drop owns its frame (no phrase swap or cut on the same beat).
    let dropped = false;
    for (const e of f.events) {
      if (e === 'breakdown' || e === 'build') {
        phase = 'breakdown';
        wantArm = settings.autoDrops && !fire.holding;
        knights.low(fire.knights);
      } else if (e === 'drop') {
        phase = 'groove';
        dropped = true;
        wantArm = false;
        // A held blade always strikes. Otherwise a big drop recolors the fire; a small
        // one (a short cut coming back) throws a ring. After a build-up, a moment of
        // black comes first, and the drop lands out of it.
        // (A held blade striking on a small one brings no preset scene: only big drops do.)
        const big = fire.holding || (settings.autoDrops && f.drop !== 'small');
        dropBig = f.drop !== 'small';
        if (big && on('blackout') && stage >= 2 && !reducedMotion) dropAt = now() + 0.09;
        else if (big) strike({ drop: dropBig });
        else if (settings.autoDrops) {
          ring(1);
          render.drop();
          dropHits();
          knights.drop(fire.knights, 'small');
        }
        // (No strike, so no scene: one waiting for this breakdown's drop with nothing forged
        // for it stays next, and the phrase lines go on.)
        if (!big && pending?.how === 'drop') pending = null;
        stage = 0;
        if (!player.flyShow) show.set('strobe');
      } else if (e === 'return') {
        phase = 'groove';
        wantArm = false;
        if (fire.holding)
          heldSince = 0; // the energy crept back: strike on the next downbeat
        // (No drop, and nothing held to strike: a scene waiting for this breakdown's drop stays next.)
        else if (pending?.how === 'drop') pending = null;
        knights.back(fire.knights, { intensity: f.intensity ?? f.level });
      } else if (e === 'start') {
        phase = 'groove';
        // The loop's opening scene (a scene already playing carries on), in the start's own
        // puff, before the knights start, so they start from it.
        const first = loop.start();
        if (first && (first === 'free' ? !!player.scene : first.ref !== player.ref || !player.scene)) {
          handPicked = false;
          play(first, { flash: true, knights: false });
        }
        if (player.holds('place') && settings.scenery !== fire.scenery) fire.setScenery(settings.scenery);
        fire.puff(0.8);
        bang(0.5);
        knights.start(fire.knights, { scenery: fire.scenery ?? null });
        onEvent('start', { title: !!settings.title });
      } else if (e === 'silence') silence();
    }
    if (f.state === 'groove' && phase !== 'groove') phase = 'groove';
    // (A swap still landing when the breakdown began just delays the forge.)
    const low = f.state === 'breakdown' || f.state === 'build';
    if (wantArm && low && !fire.forging && arm()) wantArm = false;

    // Beats (or raw kicks until the tempo locks). In a breakdown the grid runs on.
    const onGrid = f.locked || (low && f.bpm > 0);
    for (const beat of f.beats) {
      lastBeat = beat;
      beatAt = beat.time;
      beatCount = beat.count;
      if (!onGrid) continue;
      beatSign = -beatSign;
      const s = Math.min(1, beat.strength * Math.min(1.4, settings.reactivity));
      const accent = beat.beat === 0;
      if (s > 0.05) {
        fire.pulse(s, { accent, blink: false });
        show.beat(s, accent, fire.fireflies, period);
        looks.beat(s, accent, period);
        kickEnv = Math.max(kickEnv, s);
        punch = Math.max(punch, s * (accent ? 1 : 0.6));
        windKick = Math.max(windKick, s);
        if (settings.blink) flyMoves.beat(s, accent, fire.fireflies, beatSign);
        if (accent && on('punch')) fire.shake(0.05 * s);
        knights.beat(fire.knights, { strength: s, groove: f.state === 'groove', low });
      } else if (low && fire.holding) {
        // No kick: the held blade still throbs on the beat, harder as it builds.
        fire.pulse(0.15 + 0.5 * f.build, { accent, blink: false });
      }
      if (accent && !dropped) onBar(beat, period, f);
    }
    if (!onGrid && f.kick) {
      fire.pulse(Math.min(1, f.kick * settings.reactivity), { blink: false });
      show.beat(Math.min(1, f.kick), false, fire.fireflies, 0.5);
      kickEnv = Math.max(kickEnv, f.kick);
      punch = Math.max(punch, f.kick * 0.6);
    }
    // The knights' beat: the grid's position (the lead included, so their hits land with the
    // fire's pulses), sampled every frame rather than summed, so hit-stops can't knock them
    // off it. A small jump (a nudge, a new tempo) is eased over 80 ms; a big one (a new beat
    // 1, the drop's) is taken at once, modulo 8 beats (every move repeats within that).
    if (period) {
      const beatPos = beatCount + (now() + settings.offset / 1000 - beatAt) / period;
      const ahead = kBeat + dt / period;
      let err = beatPos - ahead;
      err -= 8 * Math.round(err / 8);
      kBeat = Math.abs(err) > 1 ? ahead + err : ahead + err * (1 - Math.exp(-dt / 0.08));
      if (onGrid) fire.knights?.clock(kBeat, period);
    }
    knights.update(fire.knights, dt, { beatPos: kBeat, period, scenery: fire.scenery, live });
    if (f.hat) looks.hat(f.hat);
    if (on('sparks') && f.hat)
      fire.sparkle(Math.round((4 + 8 * f.hat) * Math.min(1.5, settings.reactivity) * (0.4 + 0.6 * budget)));

    // Continuous drive (a scene's fire shape added on top, in silence too).
    const o = player.offsets;
    d.level = r * (0.8 * b.bass + 0.5 * f.level - 0.3) + o.level;
    d.brightness = r * (0.3 * b.bass + 0.45 * kickEnv);
    d.size = r * (0.25 * b.bass + 0.4 * kickEnv) + 0.18 * breath + o.size;
    d.height = r * (0.4 * f.level + 0.8 * kickEnv - 0.15) + o.height;
    d.turbulence = r * (0.6 * b.mid + 0.7 * hi - 0.2) + o.turbulence;
    d.glow = r * (0.35 * b.bass + 0.8 * kickEnv) + o.glow;
    d.exposure = reducedMotion ? 0 : r * 0.1 * kickEnv;
    windPhase += (dt * TAU) / Math.max(1, (period || 0.5) * 8);
    d.windX = (reducedMotion ? 0 : (Math.sin(windPhase) * 0.3 * b.mid + beatSign * 0.55 * windKick) * r) + o.windX;
    d.windZ = (reducedMotion ? 0 : Math.cos(windPhase * 0.7) * 0.15 * b.mid * r) + o.windZ;

    const build = low ? f.build : 0;
    // Fireflies: the light show and the moves, and faster the louder it gets.
    const fl = fire.fireflies;
    const pinnedShow = player.flyShow; // (a scene's pattern, kept whatever the music does)
    const flySpeed = effects.fireflies.speed * player.flySpeed;
    if (fl && settings.blink && presence > 0.05) {
      if (pinnedShow) {
        if (show.pattern !== pinnedShow) show.set(pinnedShow);
      } else if (low && !wasLow) show.set('breathe');
      else if (!low && wasLow && show.pattern === 'breathe') show.set(pick(GROOVE_SHOWS));
      if (!settings.flyMoves[flyMoves.move]) flyMoves.next(settings.flyMoves);
      if (on('sparks') && f.hat) show.hat(f.hat, fl);
      const beatPos = period ? beatCount + (now() - beatAt) / period : now() * 2;
      show.update(fl, dt, {
        t: now(),
        beatPos,
        period,
        energy: f.level * presence,
        build,
        low,
        holding: fire.holding,
        cx: 0.02,
        cz: 0.02,
      });
      flyMoves.update(fl, { beatPos, period, energy: f.level * presence });
      fl.speed = flySpeed * (1 + presence * (0.3 * f.level + 0.4 * kickEnv));
      lastLit = -1;
    } else if (fl && (lastLit !== -2 || lastFlySpeed !== flySpeed)) {
      show.release(fl);
      fl.speed = flySpeed;
      lastLit = -2;
    }
    lastFlySpeed = flySpeed;
    wasLow = low;

    // The looks and layers: their effects, and a breakdown's framing.
    looks.sync(settings.looks);
    // (A scene's pinned look shows at its painted strength even in silence; Effects
    // Strength 0 still means a clean picture.)
    const rest = settings.glitch > 0 ? Math.min(1, settings.glitch) : 0;
    // (The palette cycles only while the user's own Color Cycle isn't Off, and never under
    // reduced motion: a scene's Echo look under Low Flash or Chill, or the Painter's painted
    // one under reduced motion, plays without its palette steps and spins.)
    const cycles = !reducedMotion && modeOf(base.dropFx?.cycle ?? 'mix') !== 'off';
    looks.update(dt, {
      amt: reducedMotion ? 0 : settings.glitch * presence * (0.35 + 0.65 * budget),
      build,
      low,
      energy: f.level * presence,
      modes: settings,
      rest,
      cycles,
    });
    render.update(now());
    // The scenery's colors, blending to a new palette's.
    if (colors.update(dt)) fire.refreshScene();

    fire.charge = low ? Math.max(f.build, 0.2) : 0.6;
    // A weapon held for too long (a breakdown with no drop) strikes on the next downbeat.
    if (heldSince > 0 && fire.holding && now() - heldSince > 50) heldSince = 0;
    if (fire.swinging) punch = Math.max(punch, 0.35 * kickEnv);

    // Build-ups in stages: each quarter of the way up adds a notch.
    if (low && settings.stages && !reducedMotion) {
      const next = build < 0.25 ? 0 : build < 0.5 ? 1 : build < 0.75 ? 2 : build < 0.9 ? 3 : 4;
      if (next > stage) {
        stage = next;
        onEvent('stage', { stage });
        fire.pulse(0.4 + 0.15 * stage, { accent: true, blink: true });
        if (stage >= 2) looks.bang(0.2 * stage, { flash: false });
        if (stage === 3) fire.ring(0.5);
        if (stage === 4) fire.fireflies?.dance(0.8, { dir: beatSign, lift: 0.8 });
        knights.stage(fire.knights, stage);
      }
      // The last stretch: sparks and tremors climbing with it.
      if (stage === 4) {
        if (Math.random() < dt * 12) fire.sparkle(3);
        if (on('punch') && Math.random() < dt * 4) fire.shake(0.03);
      }
    } else if (!low && dropAt < 0) stage = 0;

    camera.update(dt, {
      period,
      punch: on('punch') ? punch : 0,
      holding: fire.holding,
      build,
      breath: breath * (on('breathe') ? 1 : 0),
      knights: fire.knights?.positions,
    });
  }

  function onBar(beat, period, f) {
    sinceDrop++;
    onEvent('bar', { bar: beat.bar });
    // Held too long, or the energy crept back without a drop: strike now (no drop: a scene
    // forged for stays next).
    if (heldSince === 0 && fire.holding) {
      strike({ title: false, drop: false });
      return;
    }
    const groove = f.state === 'groove';
    // Preset scenes: one waiting for this downbeat lands now, with a flash (and one whose
    // swap never landed: cancelled, or late); with Scenes switched off, the loop's scene
    // gives way to the free show. With a blade held for the drop, one waiting lands in its
    // strike instead (strike() takes it): landing now would re-equip the fire and cut the
    // blade down before its drop.
    loop.bar();
    if (pending?.how === 'beat' && !fire.holding && (pending.at < 0 || beat.bar >= pending.at)) playOnBeat(pending);
    else if (pending?.how === 'phrase' && !fire.holding && beat.bar >= pending.until) playOnBeat(pending);
    else if (!pending && player.scene && !handPicked && modeOf(settings.scenes, 'mix') === 'off')
      playOnBeat({ entry: 'free', how: 'beat' });
    knights.bar(fire.knights, {
      bar: beat.bar,
      budget,
      intensity: f.intensity ?? f.level,
      strength: beat.strength,
      locked: f.locked,
      groove,
      low: f.state === 'breakdown' || f.state === 'build',
    });
    // Every `bars` bars, and two bars after a drop.
    const due = (bars) => !!bars && (sinceDrop === 2 || (beat.bar > 0 && beat.bar % bars === 0 && sinceDrop > 2));
    let swapped = false;
    // A scene change due on the coming phrase line: its swap is forged now so the impact
    // brings it on that downbeat; with the forge busy (or a blade held, or the same weapon
    // as the one in the fire) it lands there with a flash instead (a blade still held by
    // then: in its drop's strike).
    if (!pending && groove && period) {
      const beats = swapBeats(period);
      const at = beat.bar + beats / 4;
      if (loop.due(at)) {
        const next = loop.advance();
        if (next) {
          const eq = equipFor(next);
          if (!pendingSync && !fire.holding && eq.weapon !== fire.weapon && forgeIn(beats, period, beat.time, eq)) {
            pending = { entry: next, how: 'phrase', flame: eq.flame, until: at + 1 };
            swapped = true;
          } else pending = { entry: next, how: 'beat', at };
        }
      }
    }
    // The fireflies change their pattern every 8 bars (unless a scene keeps one) and their move every `flyBars`.
    if (groove && due(8) && !player.flyShow) show.set(pick(GROOVE_SHOWS.filter((p) => p !== show.pattern)));
    if (groove && due(clock.bars('flyBars'))) {
      flyMoves.next(settings.flyMoves);
      clock.reroll('flyBars');
    }
    // A new look every `lookBars` (and after each drop, whatever the setting).
    if (groove && (sinceDrop === 2 || due(clock.bars('lookBars')))) {
      looks.next(settings.looks);
      clock.reroll('lookBars');
      onEvent('look', { name: lookName() });
    }
    // A synced swap asked for (manually or by the phrase timer) starts on this downbeat.
    if (swapped) {
      /* (the scene's swap) */
    } else if (pendingSync) {
      swapped = forgeIn(pendingSync.beats, period, beat.time);
      pendingSync = null;
    } else if (clock.bars('phraseBars') && groove && !fire.forging && period) {
      // Start early enough that the impact lands on the next phrase's first beat.
      const beats = swapBeats(period);
      const barsAhead = beats / 4;
      if ((beat.bar + barsAhead) % clock.bars('phraseBars') === 0 && beat.bar + barsAhead > 0)
        swapped = forgeIn(beats, period, beat.time);
      if (swapped) clock.reroll('phraseBars');
    }
    let comboed = false;
    const combos = clock.bars('combos');
    if (groove && !fire.forging && !swapped && combos >= 0) {
      const time = (combos > 0 && beat.bar > 0 && beat.bar % combos === combos / 2) || sinceDrop === 2;
      if (time && f.level > 0.3) comboed = combo(period, beat.time);
      if (comboed) clock.reroll('combos');
    }
    if (groove && !fire.forging && !swapped && !comboed && beat.bar > 0) {
      const ringBars = clock.bars('ringBars');
      if (ringBars && beat.bar % ringBars === 0 && budget >= 0.45) {
        ring(0.6 + 0.6 * beat.strength);
        clock.reroll('ringBars');
      } else if (on('echo') && beat.strength > 0.2) fire.echo();
    }
    // Cuts: every bar right after a drop, then every `cutBars`.
    // (A scene just arrived keeps its framing for a bar or so, even one that lets the cuts take over.)
    if (
      settings.camera === 'cuts' &&
      !camera.held &&
      now() - arrivedAt > 6 * period &&
      !fire.holding &&
      !fire.swinging &&
      !comboed &&
      beat.bar > 0
    ) {
      const bars = sinceDrop < 8 && f.level > 0.5 ? 1 : clock.bars('cutBars');
      // While the knights dance (and Knight Cameras lets it), about one cut in three goes to them.
      const toKnights = knights.camOn && Math.random() < 0.35;
      if (bars && beat.bar % bars === 0) {
        camera.cut(toKnights ? pick(camera.knightShots()) : null, { bars });
        clock.reroll('cutBars');
      }
    }
    // Maybe an x-ray flip (render.js; not on a bar that brings a new look).
    render.bar(now(), { period, sinceDrop, budget });
  }

  return {
    update,
    hit,
    arm,
    strike,
    ring,
    combo: () => comboSoon(lastPeriod),
    glitchHit,
    silence,
    nextLook() {
      looks.next(settings.looks);
      return lookName();
    },
    /** Send the scene every Render setting as it stands (render.js), with the show's current rolls. */
    applyRender: () => render.apply(),
    /** The render show's current rolls: the palette, pixel size, x-ray view… (render.js). */
    get render() {
      return render.live;
    },
    get look() {
      return lookName();
    },
    /** The knights by the fire, for the page: { present, dancing, mode, text } (knightShow.js). */
    get knights() {
      return knights.status;
    },
    /** K: the knights dance now (for a phrase), or sit back down: 'dance' | 'sit' | null. */
    danceNow: () => knights.danceNow(fire.knights, { budget }),
    /**
     * Shift+K: the knights come or go: on the next drop's flash with one coming (a blade
     * held for it), otherwise at once with a punch of the look. 'in' | 'out' | 'in-next' | 'out-next' | null.
     */
    knightsInOut() {
      const r = knights.toggle(fire.knights, { holding: fire.holding });
      if (r === 'in' || r === 'out') {
        fire.puff(0.6);
        bang(0.45);
      }
      return r;
    },
    get flyMove() {
      return FLY_MOVES[flyMoves.move];
    },
    forgeOnBeat,
    /** Cut to a shot or a rig (none: another shot). Returns its key. */
    cut: (name, opts) => camera.cut(name, opts),
    /**
     * A flame landed (the scene's onImpact): the scenery follows its palette. A scene whose
     * swap it was arrives with it (its impact is the scene's moment). The scene's own flame
     * keeps the scene's own scenery colors (scenePlayer.js keepsScenery: a Base scene's
     * arrival would otherwise recolor them the moment they were pinned).
     */
    landed(key) {
      if (pending?.how === 'phrase' && key === pending.flame) {
        const p = pending;
        pending = null;
        play(p.entry, { landed: true });
      }
      // A struck blade that wasn't the scene's: the scene's flame (and weapon and element, if it
      // sets them) at once, under this impact's flash. (Not a landing where it stands: that
      // would blend back from the wrong flame for a second. Its own landing follows: the
      // scenery goes with that one.)
      if (recolor && key === recolor.at) {
        const r = recolor;
        recolor = null;
        const weapon = r.weapon ?? fire.weapon;
        // (Unless another scene came in the meantime: it brought its own.)
        if (weapon && player.scene === r.scene) {
          fire.equip(weapon, r.flame, { element: r.element ?? undefined, instant: true }).catch(() => {});
          return;
        }
      }
      if (!player.keepsScenery(key)) colors.landed(key);
    },
    get phase() {
      return phase;
    },
    /** 0..1: how much the effects may do now (the song's shape), and the build's stage. */
    get budget() {
      return budget;
    },
    get stage() {
      return stage;
    },
    get shot() {
      return camera.shot;
    },
    get lastBeat() {
      return lastBeat;
    },
    /** Where the fire sits on screen, as a fraction of the view from center (+x right, +y up). */
    frame: (sx, sy, o) => camera.frame(sx, sy, o),
    setShot: (name) => camera.setShot(name),
    // --- preset scenes (scenePlayer.js, sceneLoop.js) ---------------------------------
    /**
     * Play a scene now: a library entry ({ ref, scene }), a bare scene (the Painter's; `ref`
     * in the options if it has one) or null (back to the free show). Options: `mode` 'hold' |
     * 'base' (default: With the Music, or the scene's own), `instant` (no forming, blending or
     * impact: the Painter's edits, a backdrop), `flash` (default: unless instant; the
     * scenery changes with a flash), `onBeat` (while the music plays: on the next downbeat,
     * with a flash), `fresh` (see scenePlayer.js apply; default: a new scene, or anything but
     * an instant re-apply of the one playing, which touches only the parts that changed).
     * Null at once (the start screen): the free show whole, the user's place, knights, look
     * and framing, and the fire in the show's own colors (as a live return's recolor brings
     * them). The loop carries on from it. Returns true if anything changed (or it's queued).
     * @param {SceneEntry | Scene | null} target
     * @param {{ ref?: string | null, mode?: 'hold'|'base', instant?: boolean, flash?: boolean, onBeat?: boolean, fresh?: boolean }} [o]
     */
    scene(target, { ref = null, mode, instant = false, flash = !instant, onBeat = false, fresh } = {}) {
      const entry = entryOf(target, ref);
      handPicked = !!entry;
      loop.jump(entry);
      if (pending?.how !== 'phrase') pending = null;
      if (onBeat && musicOn() && lastPeriod) {
        pending = { entry: entry ?? 'free', how: 'beat', at: -1 };
        return true;
      }
      const was = player.scene;
      const changed = play(entry ?? 'free', { instant, flash, mode, fresh });
      if (!entry && was && instant && !fire.forging && fire.weapon) {
        fire
          .equip(fire.weapon, colors.next(fire.flame), {
            element: nextElement(undefined, { user: true }),
            instant: true,
          })
          .catch(() => {});
      }
      return changed;
    },
    /**
     * N: the next scene in the loop now, even with Scenes off (and out of a solo lock): on
     * the next downbeat with a flash while the music plays (with a blade held for the drop,
     * in its strike: sceneWhen), at once with an impact otherwise.
     * Returns its entry (null: no scenes at all).
     * @returns {SceneEntry | null}
     */
    nextScene() {
      const e = loop.next();
      if (!e) return null;
      handPicked = true;
      if (pending?.how !== 'phrase') pending = null;
      if (musicOn() && lastPeriod) pending = { entry: e, how: 'beat', at: -1 };
      else play(e, { flash: true });
      return e;
    },
    /** Only this scene (a ref) for the session: ?scene=…&solo (null: the loop again). */
    lockScene(ref) {
      loop.lock(ref);
    },
    /** The scene playing: its name, library ref and how it plays (null: the free show). */
    get sceneName() {
      return player.scene?.name ?? null;
    },
    get sceneRef() {
      return player.ref;
    },
    get sceneMode() {
      return player.mode;
    },
    /** The scene playing (the scene itself), or null. */
    get playingScene() {
      return player.scene;
    },
    /** The scene coming next, as far as the loop knows ('free': the free show; null: none). */
    get upNext() {
      return pending?.entry ?? loop.peek();
    },
    /**
     * When the scene waiting lands: 'drop' (a blade is held for the drop: in its strike, as N
     * in a breakdown does), 'beat' (on a downbeat, with a flash), 'phrase' (with a swap's
     * impact), or null (nothing waiting). For the page's note.
     * @returns {'drop'|'beat'|'phrase'|null}
     */
    get sceneWhen() {
      return !pending ? null : pending.how === 'drop' || fire.holding ? 'drop' : pending.how;
    },
    /**
     * Whether the scene playing holds a part now ('place' | 'colors' | 'camera' | 'look' |
     * 'render' | 'knights' | 'fireflies'): the page leaves those alone (applySettings mustn't
     * reset the scenery or the shot while it holds them).
     * @param {string} part
     */
    sceneHolds: (part) => player.holds(part),
    /** Whether the scene playing sets this setting now (its value is the scene's, not the user's): the P menu marks those rows. */
    sceneSets: (key) => !!layers.over && Object.hasOwn(layers.over, key),
    /** The user's hand wins for these settings until the next scene (the P menu, the dialog). */
    releaseScene(keys) {
      player.release(keys);
    },
    /**
     * What the show is doing now, for the stats overlay (ui/statsGroups.js turns it into rows):
     * the section, the budget, the look and its strength, the layers live and each one's
     * switch, the last drop's hits, the knights, the shot, the scene playing and the loop. A
     * snapshot made when asked (twice a second while the overlay is on), from what the show
     * already keeps: it draws no dice and changes nothing, so the show plays the same either way.
     */
    status() {
      const k = knights.status;
      const waiting = pending?.entry;
      return {
        section:
          phase === 'rest' ? 'silent' : phase === 'breakdown' ? (heard === 'build' ? 'build' : 'breakdown') : 'groove',
        sinceDrop: Number.isFinite(sinceDrop) ? sinceDrop : null,
        stage,
        budget: settings.budget ? budget : null,
        look: { names: looks.playing.map((n) => LOOKS[n]), strength: looks.strength, pinned: looks.isPinned },
        layers: looks.liveLayers().map(([key, mode]) => ({ name: LAYERS[key], mode })),
        xray: render.live.xray ? (XRAY_VIEWS[render.live.xray] ?? render.live.xray) : null,
        dropHits: lastHits ? { names: lastHits, ago: now() - lastHitsAt } : null,
        knights: { present: k.present, dancing: k.dancing, mode: k.mode },
        shot: camera.shotName,
        scene: player.scene ? { name: player.scene.name, mode: player.mode } : null,
        loop: {
          mode: modeOf(settings.scenes, 'mix'),
          locked: !!loop.locked,
          // (What's waiting for its moment, if anything: a scene by name, or null for the free show.)
          next: waiting && waiting !== 'free' ? waiting.scene.name : null,
          when: waiting ? (pending.how === 'drop' || fire.holding ? 'drop' : pending.how) : null,
        },
      };
    },
    /** The show's parts, for the Painter (the camera's pin and pause, the looks' details) and the dev tools. */
    get parts() {
      return {
        looks,
        camera,
        colors,
        knights,
        render,
        layers,
        show,
        clock,
        player,
        loop,
        get pending() {
          return pending;
        },
      };
    },
  };
}
