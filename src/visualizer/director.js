// Music → bonfire. Each frame the director turns the analyser's features into the
// scene's live `drive` (continuous), its `glitch` layer and its camera, and into events
// (beats, bars, sections):
//
//   drive     bass swells the fire and its light, the kick envelope punches its height,
//             size and glow, mids and highs stir the turbulence, and the wind throws
//             the flames one way and the other on alternate beats.
//   beats     every beat the fire kicks, the ball crackles or the ice pulses, as hard as
//             the kicks have been landing; the fireflies swing around the fire; the planted
//             blade glows. Each bar echoes its silhouette. In a breakdown the grid keeps
//             going, so a held blade still throbs on the beat.
//   fireflies a light show (fireflyShow.js): flash patterns that change every 8 bars,
//             a slow swell and a swirl around the fire or the held blade in breakdowns,
//             all flashing together right after a drop.
//   hats      throw sparks.
//   rings     every few bars the current element's ring races out, no swap needed.
//   phrases   every N bars (a setting) the fire takes a new weapon, flame and element,
//             the swap paced so its impact lands exactly on the next phrase's downbeat.
//   breakdown the bass drops out: a new weapon is forged and held over the fire in a
//             vortex of particles that tightens with the build-up, while the camera
//             pushes in and the picture starts to tear...
//   drop      ...and it strikes when the bass comes back: the vortex flung out, the ring
//             racing across the ground, a zoom punch, a shake, a burst of glitch. With
//             nothing held, the drop recolors the fire at once (a stationary hit).
//   combos    every 8 bars (a setting), and two bars after a big drop, the blade pulls up
//             out of the fire and slashes on beats 2, 3 and 4, shedding fire, and plunges
//             back in on the next downbeat, throwing a ring. The camera cuts to close,
//             dramatic angles between the slashes and punches in on each hit.
//   camera    shots around the clearing, each with its own move (orbit, push in, spin,
//             a tilt), cut every couple of bars and every bar right after a drop; a zoom
//             punch on each kick.
//   looks     the picture's effects take turns (looks.js): clean, glitch, echo, ripple,
//             kaleidoscope, ink; a new one every 16 bars and after each drop, each with
//             its own burst for the big hits. Breakdowns letterbox and close an iris
//             around the fire as the build rises; the drop snaps it open.
import { weapons } from '../content.js';
import { flames, rotation } from '../palette.js';
import { elements } from '../elements.js';
import { effects } from '../effects.js';
import { createFireflyShow } from './fireflyShow.js';
import { createLooks, LOOKS } from './looks.js';

const TAU = Math.PI * 2;
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const ease = (cur, target, tau, dt) => cur + (target - cur) * (1 - Math.exp(-dt / tau));

// Camera shots (the fire at the origin; the broken pillar back-left, the wall back-right).
//   yaw   sway around the target (radians either side), over 16 beats
//   spin  keep turning (radians per beat) instead
//   push  dolly in by this fraction over the shot
//   roll  a tilt (radians)
export const SHOTS = {
  clearing: { name: 'Clearing', pos: [0, 2.2, 6.1], target: [0, 0.55, 0], fov: 32, yaw: 0.3 },
  hearth: { name: 'Hearth', pos: [0.35, 1.25, 3.3], target: [0, 0.85, 0], fov: 38, yaw: 0.35, push: 0.12 },
  low: { name: 'Low', pos: [0.15, 0.5, 3.6], target: [0, 1.05, 0], fov: 46, yaw: 0.25 },
  above: { name: 'Above', pos: [0.3, 5.6, 2.3], target: [0, 0.05, 0], fov: 40, spin: 0.05 },
  pillar: { name: 'Pillar Side', pos: [-2.5, 1.35, 3.3], target: [0.15, 0.7, -0.3], fov: 34, yaw: 0.2, push: 0.1 },
  wall: { name: 'Wall Side', pos: [2.3, 1.5, 3.6], target: [-0.2, 0.7, -0.3], fov: 34, yaw: 0.2, push: 0.1 },
  blade: { name: 'Blade', pos: [0.3, 1.2, 2.2], target: [0, 1.0, 0], fov: 36, yaw: 0.45, push: 0.18 },
  embers: { name: 'Embers', pos: [0.9, 0.2, 2.5], target: [0, 0.6, 0], fov: 50, yaw: 0.3, roll: -0.08 },
  circle: { name: 'Circling', pos: [2.4, 2.6, 3.3], target: [0, 0.35, 0], fov: 36, spin: 0.035 },
  dutch: { name: 'Dutch', pos: [-0.6, 1.1, 3.0], target: [0, 0.8, 0], fov: 40, yaw: 0.2, roll: 0.14 },
};
// Close angles for sword combos (the blade high over the fire); not in the usual rotation.
export const COMBO_SHOTS = {
  duelLow: { name: 'Hero', pos: [0.9, 0.35, 2.4], target: [0, 1.35, 0], fov: 52, roll: -0.06, yaw: 0.15 },
  duelSide: { name: 'Side', pos: [2.5, 1.3, 0.7], target: [0, 1.2, 0], fov: 44, yaw: 0.15 },
  duelHigh: { name: 'Over', pos: [-1.3, 2.7, 2.1], target: [0, 1.05, 0], fov: 46, roll: 0.05, yaw: 0.15 },
  duelFront: { name: 'Face', pos: [0.05, 1.3, 2.7], target: [0, 1.25, 0], fov: 48, yaw: 0.2 },
};
const CLOSE = ['blade', 'hearth', 'low'];
const WIDE = ['clearing', 'above', 'circle'];

export const DEFAULT_SETTINGS = {
  sensitivity: 1,       // onset thresholds (higher catches softer kicks)
  reactivity: 1.2,      // how hard the fire answers
  offset: 40,           // ms: beats this early, for render/display latency
  particles: 'more',    // normal | more | max
  sparks: true,         // hats throw sparks
  blink: true,          // fireflies blink and dance on the beat
  autoDrops: true,      // forge in breakdowns, strike on the drop
  phraseBars: 16,       // a new weapon every N bars (0: only on drops)
  ringBars: 4,          // an extra ring every N bars (0: never)
  echo: true,           // the blade's silhouette echoes out on every bar
  combos: 8,            // a sword combo every N bars (0: only after drops, -1: never)
  camera: 'cuts',       // still | drift | cuts
  cutBars: 2,
  punch: true,          // zoom punch on kicks, shake on the big hits
  shot: 'clearing',
  glitch: 1,            // 0..2: how strong the looks' effects are
  looks: Object.fromEntries(Object.keys(LOOKS).map((k) => [k, true])),
  lookBars: 16,         // a new look every N bars (0: only after drops)
  scanlines: false,
  mirror: false,
  flash: true,          // a negative flash on drops
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
  let shot = settings.shot;
  let shotT = 0;        // seconds into the current shot
  let shotLen = 8;      // how long it's expected to run (for the push-in)
  let driftT = 0;
  let lastPeriod = 0;
  let pendingSync = null; // { beats } a synced swap to start on the next downbeat
  let heldSince = -1;
  let wantArm = false;    // a breakdown wants a blade forged as soon as the fire is free
  let phase = 'rest';     // rest | groove | breakdown (for the HUD)
  let lastBeat = null;
  let sinceDrop = Infinity; // bars since the last drop
  let holdEase = 0;     // 1 while a blade is held: the camera rises to keep it all in frame
  const framing = { sx: 0, sy: 0, toX: 0, toY: 0 }; // where the fire sits on screen (the start menu pushes it aside)
  const show = createFireflyShow({ reducedMotion });
  const looks = createLooks(g);
  const GROOVE_SHOWS = ['blink', 'species', 'chase', 'twinkle'];
  let wasLow = false;
  let beatAt = 0;        // the last beat's grid time and count, for a continuous beat position
  let beatCount = 0;
  let comboCuts = [];    // when to cut between a combo's slashes (performance clock, s)
  const now = () => performance.now() / 1000;

  // --- choosing the next fire -----------------------------------------------------------
  const weaponKeys = Object.keys(weapons);
  function nextElement(prefer) {
    const on = Object.keys(settings.elements).filter((id) => settings.elements[id]);
    if (prefer && on.includes(prefer)) return prefer;
    const pool = on.length ? on : ['fire'];
    const total = pool.reduce((s, id) => s + (elements[id]?.weight ?? 1), 0);
    let r = Math.random() * total;
    for (const id of pool) { r -= elements[id]?.weight ?? 1; if (r < 0) return id; }
    return pool.at(-1);
  }
  function nextFlame(step = 0) {
    const keys = rotation().length ? rotation() : Object.keys(flames);
    if (step) {
      const all = Object.keys(flames);
      return all[(all.indexOf(fire.flame) + step + all.length) % all.length];
    }
    const fresh = keys.filter((k) => k !== fire.flame);
    return pick(fresh.length ? fresh : keys);
  }
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
    if (settings.camera !== 'still') cut(pick(CLOSE), 32);
    onEvent('arm');
    return true;
  }
  /** The drop: a held weapon strikes; otherwise the fire recolors at once. */
  function strike({ title = settings.titleOnDrop } = {}) {
    const struck = fire.release(3) || hit();
    if (!struck) return false;
    heldSince = -1;
    sinceDrop = 0;
    if (settings.camera !== 'still') cut(pick(WIDE), 4);
    bang(1);
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
  /** The big-hit package: zoom punch, shake, glitch burst, fireflies scatter, maybe a negative flash. */
  function bang(amount = 1) {
    if (settings.punch) { punch = Math.max(punch, 0.6 * amount); fire.shake(0.3 * amount); }
    if (!reducedMotion) looks.bang(amount, { flash: settings.flash });
    fire.fireflies?.dance(0.9 * amount, { dir: beatSign, lift: 0.6 * amount });
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
  /**
   * A sword combo from the beat at `from` (grid time): slashes on the next three beats,
   * the plunge on the fourth (every other beat when the tempo is very fast).
   */
  function combo(period, from) {
    if (fire.forging || !period) return false;
    const lead = settings.offset / 1000;
    const step = period < 0.33 ? period * 2 : period;
    const t0 = from - lead - now();
    const hits = [1, 2, 3].map((k) => t0 + k * step);
    if (hits[0] < 0.15) return false;
    const plunge = t0 + 4 * step;
    fire.swing({ hits, plunge }).then((ok) => {
      if (!ok) return;
      bang(0.9);
      if (settings.camera !== 'still') cut(pick(WIDE), 4);
    });
    if (settings.camera !== 'still') {
      cut(pick(Object.keys(COMBO_SHOTS)), 1);
      comboCuts = hits.slice(0, -1).map((h) => now() + h + step * 0.18);
    }
    onEvent('combo');
    return true;
  }
  /** A combo as soon as possible: the next beat far enough off starts it. */
  function comboSoon(period) {
    if (!period || !lastBeat) return false;
    let from = lastBeat.time;
    while (from + period - settings.offset / 1000 - now() < 0.3) from += period;
    return combo(period, from);
  }
  /** A burst of glitch on demand. */
  function glitchHit() {
    if (!reducedMotion) looks.bang(1);
    punch = Math.max(punch, 0.3);
  }

  // --- camera ---------------------------------------------------------------------------
  function cut(name, bars = settings.cutBars || 8) {
    const names = Object.keys(SHOTS).filter((n) => n !== shot);
    shot = name && name !== shot ? name : pick(names);
    if (!SHOTS[shot] && !COMBO_SHOTS[shot]) shot = 'clearing';
    shotT = 0;
    shotLen = Math.max(2, bars * 4 * (lastPeriod || 0.5));
    driftT = Math.random() * 100;
    onEvent('shot', { name: (SHOTS[shot] ?? COMBO_SHOTS[shot]).name });
  }
  const pose = { pos: [0, 0, 0], target: [0, 0, 0], fov: 32, sx: 0, sy: 0, roll: 0 };
  function applyCamera(dt, period) {
    const s = SHOTS[shot] ?? COMBO_SHOTS[shot] ?? SHOTS.clearing;
    const beat = period || 0.5;
    let yaw = 0;
    let push = 0;
    const moving = settings.camera !== 'still' && !reducedMotion;
    if (moving) {
      driftT += dt;
      shotT += dt;
      yaw = s.spin ? (shotT / beat) * s.spin : Math.sin((driftT / (beat * 16)) * TAU) * (s.yaw ?? 0.25);
      push = (s.push ?? 0) * Math.min(1, shotT / shotLen);
    }
    holdEase = ease(holdEase, fire.holding ? 1 : 0, 0.6, dt);
    const [tx, ty0, tz] = s.target;
    const ty = ty0 + 0.45 * holdEase; // the held blade hangs high over the fire
    const dx = (s.pos[0] - tx) * (1 - push);
    const dy = (s.pos[1] - ty0) * (1 - push) + 0.15 * holdEase;
    const dz = (s.pos[2] - tz) * (1 - push);
    const c = Math.cos(yaw);
    const sn = Math.sin(yaw);
    pose.pos[0] = tx + dx * c - dz * sn;
    pose.pos[1] = ty + dy;
    pose.pos[2] = tz + dx * sn + dz * c;
    pose.target[0] = tx; pose.target[1] = ty; pose.target[2] = tz;
    // The zoom punch narrows the view for a moment on each kick.
    pose.fov = (s.fov + 7 * holdEase) * (1 - (settings.punch && !reducedMotion ? 0.09 * punch : 0));
    pose.roll = moving ? (s.roll ?? 0) + Math.sin(driftT * 0.7) * 0.02 : 0;
    framing.sx = ease(framing.sx, framing.toX, 0.5, dt);
    framing.sy = ease(framing.sy, framing.toY, 0.5, dt);
    pose.sx = framing.sx;
    pose.sy = framing.sy;
    fire.setPose(pose, { instant: true });
  }

  // --- per frame ------------------------------------------------------------------------
  function update(f, dt) {
    const live = f.state !== 'silent';
    presence = ease(presence, live ? 1 : 0, live ? 0.4 : 1.5, dt);
    const r = settings.reactivity * presence;
    const b = f.bands;
    const hi = Math.max(b.highMid, b.high);
    kickEnv *= Math.exp(-dt / 0.14);
    punch *= Math.exp(-dt / 0.12);
    windKick *= Math.exp(-dt / 0.25);
    const period = f.bpm ? 60 / f.bpm : 0;
    if (period) lastPeriod = period;

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
        // one (a short cut coming back) throws a ring.
        if (fire.holding || (settings.autoDrops && f.drop !== 'small')) strike();
        else if (settings.autoDrops) ring(1);
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
        if (settings.blink) fire.fireflies?.dance(s * (accent ? 0.8 : 0.5), { dir: beatSign, lift: accent ? s * 0.3 : 0 });
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
    if (settings.sparks && f.hat) fire.sparkle(Math.round((4 + 8 * f.hat) * Math.min(1.5, settings.reactivity)));

    // Continuous drive.
    d.level = r * (0.8 * b.bass + 0.5 * f.level - 0.3);
    d.brightness = r * (0.3 * b.bass + 0.45 * kickEnv);
    d.size = r * (0.25 * b.bass + 0.4 * kickEnv);
    d.height = r * (0.4 * f.level + 0.8 * kickEnv - 0.15);
    d.turbulence = r * (0.6 * b.mid + 0.7 * hi - 0.2);
    d.glow = r * (0.35 * b.bass + 0.8 * kickEnv);
    d.exposure = reducedMotion ? 0 : r * 0.1 * kickEnv;
    windPhase += (dt * TAU) / Math.max(1, (period || 0.5) * 8);
    d.windX = reducedMotion ? 0 : (Math.sin(windPhase) * 0.3 * b.mid + beatSign * 0.55 * windKick) * r;
    d.windZ = reducedMotion ? 0 : Math.cos(windPhase * 0.7) * 0.15 * b.mid * r;

    const build = low ? f.build : 0;
    // Fireflies: the light show, and faster the louder it gets.
    const fl = fire.fireflies;
    if (fl && settings.blink && presence > 0.05) {
      if (low && !wasLow) show.set('breathe');
      if (!low && wasLow && show.pattern === 'breathe') show.set(pick(GROOVE_SHOWS));
      if (settings.sparks && f.hat) show.hat(f.hat, fl);
      const beatPos = period ? beatCount + (now() - beatAt) / period : now() * 2;
      show.update(fl, dt, { t: now(), beatPos, period, energy: f.level * presence, build, low, holding: fire.holding, cx: 0.02, cz: 0.02 });
      fl.speed = effects.fireflies.speed * (1 + presence * (0.3 * f.level + 0.4 * kickEnv));
      lastLit = -1;
    } else if (fl && lastLit !== -2) {
      show.release(fl);
      fl.speed = effects.fireflies.speed;
      lastLit = -2;
    }
    wasLow = low;

    // The look: its effects, and a breakdown's framing.
    looks.update(dt, { amt: reducedMotion ? 0 : settings.glitch * presence, build, low, energy: f.level * presence, scanlines: settings.scanlines, mirror: settings.mirror });

    fire.charge = low ? Math.max(f.build, 0.2) : 0.6;
    // A weapon held for too long (a breakdown with no drop) strikes on the next downbeat.
    if (heldSince > 0 && fire.holding && now() - heldSince > 50) heldSince = 0;

    // Between a combo's slashes: cut to another close angle.
    if (comboCuts.length && now() >= comboCuts[0]) {
      comboCuts.shift();
      if (fire.swinging) cut(pick(Object.keys(COMBO_SHOTS).filter((n) => n !== shot)), 1);
    }
    if (fire.swinging) punch = Math.max(punch, 0.35 * kickEnv);

    applyCamera(dt, period);
  }

  function onBar(beat, period, f) {
    sinceDrop++;
    // Held too long: strike now.
    if (heldSince === 0 && fire.holding) { strike({ title: false }); return; }
    const groove = f.state === 'groove';
    let swapped = false;
    // The fireflies change their pattern every 8 bars (and settle down 2 bars after a drop).
    if (groove && (sinceDrop === 2 || (beat.bar > 0 && beat.bar % 8 === 0 && sinceDrop > 2))) {
      show.set(pick(GROOVE_SHOWS.filter((p) => p !== show.pattern)));
    }
    // A new look every `lookBars`, and two bars after a drop.
    if (groove && (sinceDrop === 2 || (settings.lookBars && beat.bar > 0 && beat.bar % settings.lookBars === 0 && sinceDrop > 2))) {
      looks.next(settings.looks);
      onEvent('look', { name: LOOKS[looks.look] });
    }
    // A synced swap asked for (manually or by the phrase timer) starts on this downbeat.
    if (pendingSync) {
      swapped = forgeIn(pendingSync.beats, period, beat.time);
      pendingSync = null;
    } else if (settings.phraseBars && groove && !fire.forging && period) {
      // Start early enough that the impact lands on the next phrase's first beat.
      const beats = swapBeats(period);
      const barsAhead = beats / 4;
      if ((beat.bar + barsAhead) % settings.phraseBars === 0 && beat.bar + barsAhead > 0) swapped = forgeIn(beats, period, beat.time);
    }
    let comboed = false;
    if (groove && !fire.forging && !swapped && settings.combos >= 0) {
      const due = (settings.combos > 0 && beat.bar > 0 && beat.bar % settings.combos === settings.combos / 2) || sinceDrop === 2;
      if (due && f.level > 0.3) comboed = combo(period, beat.time);
    }
    if (groove && !fire.forging && !swapped && !comboed && beat.bar > 0) {
      if (settings.ringBars && beat.bar % settings.ringBars === 0) ring(0.6 + 0.6 * beat.strength);
      else if (settings.echo && beat.strength > 0.2) fire.echo();
    }
    // Cuts: every bar right after a drop, then every `cutBars`.
    if (settings.camera === 'cuts' && !fire.holding && !fire.swinging && !comboed && beat.bar > 0) {
      const every = sinceDrop < 8 && f.level > 0.5 ? 1 : settings.cutBars;
      if (every && beat.bar % every === 0) cut(null, every);
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
    forgeOnBeat,
    cut,
    get phase() { return phase; },
    get shot() { return shot; },
    get lastBeat() { return lastBeat; },
    /** Where the fire sits on screen, as a fraction of the view from center (+x right, +y up). */
    frame(sx = 0, sy = 0) { framing.toX = sx; framing.toY = sy; },
    setShot(name) { if (SHOTS[name]) { shot = name; settings.shot = name; shotT = 0; } },
  };
}
