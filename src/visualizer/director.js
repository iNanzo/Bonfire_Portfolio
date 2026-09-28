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
//             after each drop, with a mirror and scanlines in the mix; each has its own
//             burst for the big hits, and every drop throws a few more drawn at random.
//             Breakdowns letterbox and close an iris around the fire as the build rises;
//             the drop snaps it open.
//   colors    each new flame is one of the site's palettes, or one made on the spot
//             (colors.js), maybe with new scenery colors to match.
//   feel      bright music (strong highs) cools the picture and dark music warms it
//             (color temperature); the sub-bass makes the fire and the view breathe.
//   build-ups climb in stages (a quarter, a half, three quarters, the last stretch), each
//             a notch more: pulses, a look burst, a ring, then sparks and tremors; right
//             before the drop hits, the screen goes black for a beat of silence.
//   budget    how much is going on follows the song's shape: calm in an intro or a
//             breakdown, busy in the groove, everything in the bars after a drop.
import { drawnWeapons } from '../content.js';
import { elements } from '../elements.js';
import { effects } from '../effects.js';
import { MOVES } from '../bonfire/bladeMotion.js';
import { createFireflyShow } from './fireflyShow.js';
import { createFireflyMoves, FLY_MOVES } from './fireflyMoves.js';
import { createLooks, LOOKS, DROP_FX, MIRRORS } from './looks.js';
import { createCamera, CLOSE, WIDE, COMBO_SHOTS, SWING_CAMS, HOLD_CAMS } from './camera.js';
import { SWING_EASES } from './cameraEase.js';
import { createBarClock } from './bars.js';
import { createColors } from './colors.js';
import { SCENERIES } from '../bonfire/scenery.js';
import { approach, pick, TAU } from '../math.js';

const all = (names) => Object.fromEntries(Object.keys(names).map((k) => [k, true]));

export const DEFAULT_SETTINGS = {
  sensitivity: 1,       // onset thresholds (higher catches softer kicks)
  reactivity: 1.2,      // how hard the fire answers
  offset: 40,           // ms: beats this early, for render/display latency
  particles: 'more',    // normal | more | max
  sparks: true,         // hats throw sparks
  blink: true,          // fireflies blink and move on the beat
  flyMoves: all(FLY_MOVES),
  flyBars: 8,           // a new firefly move every N bars
  autoDrops: true,      // forge in breakdowns, strike on the drop
  phraseBars: 16,       // a new weapon every N bars (0: only on drops)
  ringBars: 4,          // an extra ring every N bars (0: never)
  echo: true,           // the blade's silhouette echoes out on every bar
  combos: 8,            // the blade leaves the fire every N bars (0: only after drops, -1: never)
  comboBars: 0,         // bars it stays out (0: 1, 2 or sometimes 4)
  moves: all(MOVES),
  rhythm: 'varied',     // beats: a move on every beat | varied: rests, and doubles at slow tempos
  alive: true,          // flourishes, a shudder on hard beats, a held blade's sway
  colors: 'site',       // site | harmonious | wild | mix (colors.js)
  scheme: 'auto',
  sceneColors: false,   // made palettes bring scenery colors of their own
  camera: 'cuts',       // still | drift | cuts
  cutBars: 2,
  transition: 'mix',    // cut | whip | glide | mix
  swingCam: 'mix',      // how the camera covers the blade out of the fire (camera.js SWING_CAMS)
  swingEase: 'mix',     // ...and how it eases while it does (cameraEase.js SWING_EASES; mix: per combo, now and then per move)
  holdCam: 'mix',       // ...and a blade held for the drop (HOLD_CAMS)
  punch: true,          // zoom punch on kicks, shake on the big hits
  shot: 'clearing',
  glitch: 1,            // 0..2: how strong the looks' effects are
  looks: all(LOOKS),
  lookBars: 16,         // a new look every N bars (0: only after drops)
  scanlines: 'mix',     // off | mix (some looks) | on
  mirror: 'mix',
  mirrors: all(MIRRORS), // which kinds of mirror (horizontal, vertical, quarter)
  flash: true,          // a negative flash on drops
  temperature: true,    // bright music cools the picture, dark music warms it
  breathe: true,        // the sub-bass makes the fire and the view swell
  stages: true,         // build-ups climb in stages
  blackout: true,       // a black frame of silence right before the drop
  budget: true,         // effects follow the song's shape (calm intros, all-out after drops)
  scenery: 'ruins',     // where the fire burns: ruins | forge | shrine | mix (a new place every other big drop)
  dropFx: all(DROP_FX),
  dropCount: 2,         // up to this many drop hits at once
  elements: { fire: true, lightning: true, ice: true },
  title: '',
  subtitle: '',
  titleOnDrop: true,
  pixelSize: 4,
};

export function createDirector(fire, { settings, onEvent = () => {}, reducedMotion = false }) {
  const d = fire.drive;
  const g = fire.glitch;
  let presence = 0;     // 0 silent → 1 music playing
  let kickEnv = 0;      // the latest beat/kick, decaying
  let punch = 0;        // zoom punch
  let windKick = 0;
  let beatSign = 1;
  let windPhase = 0;
  let lastLit = -1;
  let lastPeriod = 0;
  let pendingSync = null; // { beats } a synced swap to start on the next downbeat
  let heldSince = -1;
  let wantArm = false;    // a breakdown wants a blade forged as soon as the fire is free
  let phase = 'rest';     // rest | groove | breakdown (for the HUD)
  let lastBeat = null;
  let sinceDrop = Infinity; // bars since the last drop
  let swingCam = null;    // how the camera covers the blade while it's out
  let swingEase = 'smooth'; // ...and the feel of its moves (cameraEase.js)
  let temp = 0;           // color temperature, -1 warm … 1 cool (eased)
  let breath = 0;         // the sub-bass swell (eased)
  let stage = 0;          // how far the build-up has climbed (0–4)
  let dropAt = -1;        // (performance time) a drop waiting out its blackout
  let budget = 0.6;       // 0..1: how much the effects may do right now (the song's shape)
  let bigDrops = 0;       // (for the scenery mix: a new place every other big drop)
  const clock = createBarClock(settings); // the "every N bars" settings, rolled when on Random (bars.js)
  const show = createFireflyShow({ reducedMotion });
  const flyMoves = createFireflyMoves({ reducedMotion });
  const looks = createLooks(g);
  const colors = createColors(settings);
  const camera = createCamera(fire, settings, { reducedMotion, onShot: (name) => onEvent('shot', { name }) });
  const GROOVE_SHOWS = ['blink', 'species', 'chase', 'twinkle'];
  let wasLow = false;
  let beatAt = 0;        // the last beat's grid time and count, for a continuous beat position
  let beatCount = 0;
  const now = () => performance.now() / 1000;
  const moving = () => settings.camera !== 'still';

  // --- choosing the next fire -----------------------------------------------------------
  const weaponKeys = drawnWeapons();
  function nextElement(prefer) {
    const on = Object.keys(settings.elements).filter((id) => settings.elements[id]);
    if (prefer && on.includes(prefer)) return prefer;
    const pool = on.length ? on : ['fire'];
    const total = pool.reduce((s, id) => s + (elements[id]?.weight ?? 1), 0);
    let r = Math.random() * total;
    for (const id of pool) { r -= elements[id]?.weight ?? 1; if (r < 0) return id; }
    return pool.at(-1);
  }
  const nextFlame = (step = 0) => colors.next(fire.flame, step);
  const nextWeapon = () => pick(weaponKeys.filter((k) => k !== fire.weapon));

  // --- the moves ------------------------------------------------------------------------
  /** Recolor on the spot: same weapon, new flame and element, the ring right now. */
  function hit({ element, step = 0 } = {}) {
    if (fire.forging) return false;
    fire.equip(fire.weapon, nextFlame(step), { element: nextElement(element) }).catch(() => {});
    bang(0.7);
    return true;
  }
  /** Forge a new weapon and hold it over the fire until strike(). */
  function arm() {
    if (fire.forging) return false;
    fire.equip(nextWeapon(), nextFlame(), { element: nextElement(), hold: true }).catch(() => {});
    heldSince = now();
    if (moving()) {
      const how = settings.holdCam === 'mix' ? pick(Object.keys(HOLD_CAMS)) : settings.holdCam;
      camera.cut(how === 'close' ? pick(CLOSE) : how, { bars: 32 });
    }
    onEvent('arm');
    return true;
  }
  /** The drop: a held weapon strikes; otherwise the fire recolors at once. */
  function strike({ title = true } = {}) {
    const struck = fire.release(3) || hit();
    if (!struck) return false;
    heldSince = -1;
    sinceDrop = 0;
    // With the scenery mix, every other big drop lands somewhere new.
    if (settings.scenery === 'mix' && ++bigDrops % 2 === 0) fire.setScenery(pick(Object.keys(SCENERIES).filter((k) => k !== fire.scenery)));
    if (moving()) camera.cut(pick(WIDE), { bars: 4, move: 'cut' });
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
    if (settings.punch) { punch = Math.max(punch, 0.6 * amount); fire.shake(0.3 * amount); }
    if (!reducedMotion) looks.bang(amount, { flash: settings.flash });
    fire.fireflies?.dance(0.9 * amount, { dir: beatSign, lift: 0.6 * amount });
  }
  /** A drop's extra hits, drawn from those switched on. */
  function dropHits() {
    if (reducedMotion || !settings.glitch) return;
    const names = looks.drop(settings.dropFx, Math.max(1, Math.round(settings.dropCount * (0.5 + 0.5 * budget))));
    if (names.length) onEvent('dropfx', { names });
  }
  /**
   * A full swap timed so the impact lands `beats` beats after the beat at `from` (grid
   * time), `lead` early like every beat. Paced to the time actually left, so a late frame
   * doesn't make it land late.
   */
  function forgeIn(beats, period, from = now()) {
    if (fire.forging) return false;
    const left = from + beats * period - settings.offset / 1000 - now();
    const pace = Math.min(1.8, Math.max(0.55, fire.swapTime / Math.max(0.1, left)));
    fire.equip(nextWeapon(), nextFlame(), { element: nextElement(), pace }).catch(() => {});
    return true;
  }
  /** How many beats a synced swap takes at this tempo: the power of two closest to its natural length. */
  function swapBeats(period) {
    let best = 8;
    let bestErr = Infinity;
    for (const n of [4, 8, 16]) {
      const err = Math.abs(Math.log(fire.swapTime / (n * period)));
      if (err < bestErr) { bestErr = err; best = n; }
    }
    return best;
  }
  /** Queue a synced swap: it starts on a downbeat and lands on the downbeat after. */
  function forgeOnBeat(period) {
    if (!period) return forgeIn(8, 60 / 124);
    pendingSync = { beats: swapBeats(period) };
    return true;
  }

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
      if (varied && !rested && k < beats - 1 && Math.random() < 0.2) { rested = true; continue; }
      if (varied && !rested && step / 2 >= 0.3 && Math.random() < 0.15) hits.push(at - step / 2);
      rested = false;
      hits.push(at);
    }
    if (!hits.length || hits[0] < 0.3) return false;
    swingCam = moving() ? (settings.swingCam === 'mix' ? pick(Object.keys(SWING_CAMS)) : settings.swingCam) : null;
    swingEase = pickEase();
    if (swingCam) swingShot(swingCam, 'cut');
    fire.swing({
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
      onHit: (k, kind) => { punch = Math.max(punch, kind === 'slash' ? 0.3 : 0.5); },
    }).then((ok) => {
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

  // --- per frame ------------------------------------------------------------------------
  function update(f, dt) {
    const live = f.state !== 'silent';
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
    if (dropAt > 0 && now() >= dropAt) { dropAt = -1; g.blackout = 0; strike(); }

    // Feel: brightness → color temperature, sub-bass → breathing.
    const bright = (b.highMid + b.high) / 2 - (b.bass + b.lowMid) / 2; // -1 (dark) … 1 (bright)
    temp = approach(temp, settings.temperature ? Math.max(-1, Math.min(1, bright * 1.6)) * presence : 0, 1.5, dt);
    g.temp = temp;
    breath = approach(breath, settings.breathe ? b.bass * presence : 0, 0.45, dt);

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
      } else if (e === 'drop') {
        phase = 'groove';
        dropped = true;
        wantArm = false;
        // A held blade always strikes. Otherwise a big drop recolors the fire; a small
        // one (a short cut coming back) throws a ring. After a build-up, a moment of
        // black comes first, and the drop lands out of it.
        const big = fire.holding || (settings.autoDrops && f.drop !== 'small');
        if (big && settings.blackout && stage >= 2 && !reducedMotion) dropAt = now() + 0.09;
        else if (big) strike();
        else if (settings.autoDrops) { ring(1); dropHits(); }
        stage = 0;
        show.set('strobe');
      } else if (e === 'return') {
        phase = 'groove';
        wantArm = false;
        if (fire.holding) heldSince = 0; // the energy crept back: strike on the next downbeat
      } else if (e === 'start') {
        phase = 'groove';
        fire.puff(0.8);
        bang(0.5);
        onEvent('start', { title: !!settings.title });
      } else if (e === 'silence') {
        phase = 'rest';
        wantArm = false;
      }
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
        if (accent && settings.punch) fire.shake(0.05 * s);
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
    if (f.hat) looks.hat(f.hat);
    if (settings.sparks && f.hat) fire.sparkle(Math.round((4 + 8 * f.hat) * Math.min(1.5, settings.reactivity) * (0.4 + 0.6 * budget)));

    // Continuous drive.
    d.level = r * (0.8 * b.bass + 0.5 * f.level - 0.3);
    d.brightness = r * (0.3 * b.bass + 0.45 * kickEnv);
    d.size = r * (0.25 * b.bass + 0.4 * kickEnv) + 0.18 * breath;
    d.height = r * (0.4 * f.level + 0.8 * kickEnv - 0.15);
    d.turbulence = r * (0.6 * b.mid + 0.7 * hi - 0.2);
    d.glow = r * (0.35 * b.bass + 0.8 * kickEnv);
    d.exposure = reducedMotion ? 0 : r * 0.1 * kickEnv;
    windPhase += (dt * TAU) / Math.max(1, (period || 0.5) * 8);
    d.windX = reducedMotion ? 0 : (Math.sin(windPhase) * 0.3 * b.mid + beatSign * 0.55 * windKick) * r;
    d.windZ = reducedMotion ? 0 : Math.cos(windPhase * 0.7) * 0.15 * b.mid * r;

    const build = low ? f.build : 0;
    // Fireflies: the light show and the moves, and faster the louder it gets.
    const fl = fire.fireflies;
    if (fl && settings.blink && presence > 0.05) {
      if (low && !wasLow) show.set('breathe');
      if (!low && wasLow && show.pattern === 'breathe') show.set(pick(GROOVE_SHOWS));
      if (!settings.flyMoves[flyMoves.move]) flyMoves.next(settings.flyMoves);
      if (settings.sparks && f.hat) show.hat(f.hat, fl);
      const beatPos = period ? beatCount + (now() - beatAt) / period : now() * 2;
      show.update(fl, dt, { t: now(), beatPos, period, energy: f.level * presence, build, low, holding: fire.holding, cx: 0.02, cz: 0.02 });
      flyMoves.update(fl, { beatPos, period, energy: f.level * presence });
      fl.speed = effects.fireflies.speed * (1 + presence * (0.3 * f.level + 0.4 * kickEnv));
      lastLit = -1;
    } else if (fl && lastLit !== -2) {
      show.release(fl);
      fl.speed = effects.fireflies.speed;
      lastLit = -2;
    }
    wasLow = low;

    // The look: its effects, and a breakdown's framing.
    if (!settings.looks[looks.look]) looks.next(settings.looks);
    looks.update(dt, { amt: reducedMotion ? 0 : settings.glitch * presence * (0.35 + 0.65 * budget), build, low, energy: f.level * presence, scanlines: settings.scanlines, mirror: settings.mirror, mirrors: settings.mirrors });
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
      }
      // The last stretch: sparks and tremors climbing with it.
      if (stage === 4) {
        if (Math.random() < dt * 12) fire.sparkle(3);
        if (settings.punch && Math.random() < dt * 4) fire.shake(0.03);
      }
    } else if (!low && dropAt < 0) stage = 0;

    camera.update(dt, { period, punch, holding: fire.holding, build, breath: breath * (settings.breathe ? 1 : 0) });
  }

  function onBar(beat, period, f) {
    sinceDrop++;
    onEvent('bar', { bar: beat.bar });
    // Held too long: strike now.
    if (heldSince === 0 && fire.holding) { strike({ title: false }); return; }
    const groove = f.state === 'groove';
    // Every `bars` bars, and two bars after a drop.
    const due = (bars) => !!bars && (sinceDrop === 2 || (beat.bar > 0 && beat.bar % bars === 0 && sinceDrop > 2));
    let swapped = false;
    // The fireflies change their pattern every 8 bars and their move every `flyBars`.
    if (groove && due(8)) show.set(pick(GROOVE_SHOWS.filter((p) => p !== show.pattern)));
    if (groove && due(clock.bars('flyBars'))) { flyMoves.next(settings.flyMoves); clock.reroll('flyBars'); }
    // A new look every `lookBars` (and after each drop, whatever the setting).
    if (groove && (sinceDrop === 2 || due(clock.bars('lookBars')))) {
      looks.next(settings.looks);
      clock.reroll('lookBars');
      onEvent('look', { name: LOOKS[looks.look] });
    }
    // A synced swap asked for (manually or by the phrase timer) starts on this downbeat.
    if (pendingSync) {
      swapped = forgeIn(pendingSync.beats, period, beat.time);
      pendingSync = null;
    } else if (clock.bars('phraseBars') && groove && !fire.forging && period) {
      // Start early enough that the impact lands on the next phrase's first beat.
      const beats = swapBeats(period);
      const barsAhead = beats / 4;
      if ((beat.bar + barsAhead) % clock.bars('phraseBars') === 0 && beat.bar + barsAhead > 0) swapped = forgeIn(beats, period, beat.time);
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
      if (ringBars && beat.bar % ringBars === 0 && budget >= 0.45) { ring(0.6 + 0.6 * beat.strength); clock.reroll('ringBars'); }
      else if (settings.echo && beat.strength > 0.2) fire.echo();
    }
    // Cuts: every bar right after a drop, then every `cutBars`.
    if (settings.camera === 'cuts' && !fire.holding && !fire.swinging && !comboed && beat.bar > 0) {
      const bars = sinceDrop < 8 && f.level > 0.5 ? 1 : clock.bars('cutBars');
      if (bars && beat.bar % bars === 0) { camera.cut(null, { bars }); clock.reroll('cutBars'); }
    }
  }

  return {
    update,
    hit,
    arm,
    strike,
    ring,
    combo: () => comboSoon(lastPeriod),
    glitchHit,
    nextLook() { looks.next(settings.looks); return LOOKS[looks.look]; },
    get look() { return LOOKS[looks.look]; },
    get flyMove() { return FLY_MOVES[flyMoves.move]; },
    forgeOnBeat,
    /** Cut to a shot or a rig (none: another shot). Returns its key. */
    cut: (name, opts) => camera.cut(name, opts),
    /** A flame landed (the scene's onImpact): the scenery follows its palette. */
    landed: (key) => colors.landed(key),
    get phase() { return phase; },
    /** 0..1: how much the effects may do now (the song's shape), and the build's stage. */
    get budget() { return budget; },
    get stage() { return stage; },
    get shot() { return camera.shot; },
    get lastBeat() { return lastBeat; },
    /** Where the fire sits on screen, as a fraction of the view from center (+x right, +y up). */
    frame: (sx, sy) => camera.frame(sx, sy),
    setShot: (name) => camera.setShot(name),
  };
}
