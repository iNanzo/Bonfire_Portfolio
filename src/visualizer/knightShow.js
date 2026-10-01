// Bonfire Live's knights: who sits by the fire, and when they get up and dance. A pure
// scheduler like the fireflies' show (no three.js, so node can test it): the director tells
// it about the music (the start, sections, build stages, drops, beats and bars, the living
// blade) and it drives the scene's knights (fire.knights, bonfire/knights.js).
//
//   presence    Off / In the mix / Always. In the mix they come and go, but only where a
//               change is hidden: when the music starts (under the intro), in a big drop's
//               blackout and flash, and when the scenery changes (they form again out of
//               embers there anyway). Never mid-phrase. How many (1–4, or Random) and each
//               one's helmet (from those switched on) are rolled at the same moments.
//   sitting     before any drop they rest by the fire and nod along to the strong beats,
//               drumming on their thighs; in a breakdown they're still and watch the blade
//               being forged over the fire (the scene turns their heads to it). Dancers
//               caught by a breakdown stop on its next downbeat: the others sit down where
//               they are, the first stays on his feet (his seat is a walk away, and he'd
//               only walk back for the drop).
//   the build   at its third stage they get up and take their places round the fire,
//               bouncing, facing it and the blade held over it; at the last stretch they
//               bounce twice as fast.
//   the drop    on its first beat they leap. With Summon on the Drop they're already up and
//               in place in the flash; otherwise they spring up and hurry over, and knights
//               joining form out of embers where they'll dance. Gestures on Drops throws
//               Praise the Sun (or a hurrah, a jump for joy, a point), all at once or one
//               after another on the beat. Big moves for two bars, then the groove's moves
//               while the energy holds, a new move every few bars (New Move Every). They sit
//               back down on a phrase line when the energy falls or after a while (8 to 24
//               bars, rolled), and at once when the music stops (or the source changes).
//               A small drop: one cheer (with Gestures on Drops).
//   dancers     how many get up follows the director's budget, max(1, round(n·(0.4+0.6·budget))),
//               counted again on phrase lines; the rest nod along in their seats.
//   formations  Round the Fire (spread over the clear sides of the ring, stepping along it
//               every two bars and turning back each phrase, facing the fire or the room),
//               Line (all together, facing the camera), Solo (each his own move), Canon (the
//               same move, each a step behind the one before), or A Mix (a new one each dance,
//               sometimes a new one with a new move). Places keep to the ring's clear arcs in
//               each scenery (fire.knights.slots) and out of the corridor between the fire and
//               the cameras, and out of sight behind the fire. Those sitting one out keep
//               their places: the dancers take the cast's layout less theirs, so nobody
//               dances on top of a seated knight and the first stays on his own side.
//   armor       Armor Shine (Off / In the mix / Always): the fire's reflection sweeping over
//               the plate, now and then at rest and whenever the fire flares
//               (fire.knights.setShine). In the mix the two are rolled apart, at the same
//               hidden moments as presence.
//   reactions   Reactions (Off / In the mix / Always): they flinch when a blade lands, lean
//               from a stoke, hop as a ring passes, follow the living blade with their eyes,
//               and flinch when it swings close (fire.knights.setReactions, near()). Rolled
//               at the same hidden moments.
//   options     Style (how he's drawn and built, knightStyles.js: the site's own, one of the
//               styles, or In the mix: rolled at the hidden moments, leaning to the site's
//               default), Armor Finish (one of the steel finishes, steel.js, or In the mix:
//               rolled at the hidden moments, one finish for the whole cast), Edge Glow (the
//               armor's edges catching the fire's color: Off / In the mix / Always, Always at
//               the Glow Strength set; In the mix some stretches glow and some don't, each at
//               a strength rolled round the one set, at the hidden moments) and Seat Pose
//               (resting, watchful, or In the mix: rolled at the hidden moments). Changed by hand, at
//               once (a new style burns them away and forms them again in it; at a hidden
//               moment it's there in the flash).
//   hidden      every hidden moment (the start, a big drop, a new scenery, and retake(): a
//               preset scene arriving) takes the Knights settings as they stand: the count,
//               the helmets (a scene may set each knight's, knightHelmetOrder), the switches
//               and options, so nothing is arranged a second time a frame later.
//   by hand     K: dance now (for a phrase, even with Dance off) or sit; Shift+K: in or out
//               (on the next drop's flash if one's coming, otherwise at once).
// Moves are functions of the beat (knightPose.js): the director hands the knights the beat
// position every frame, and they only dance while the tempo holds. Reduced motion: they sit.
import { modeOf } from './looks.js';
import { sideArcs, ringPlaces, slotPlaces, restPlaces, FRONT } from '../bonfire/knightPlaces.js';
import { FINISHES } from '../bonfire/steel.js';
import { DEFAULT_STYLE, STYLES, STYLE_KEYS, STYLE_NAMES } from '../bonfire/knightStyles.js';

// (The ring's places are the engine's too: knights.js homes the others where they rest.)
export { sideArcs, ringPlaces, slotPlaces, restPlaces, FRONT };

export const MAX_KNIGHTS = 4;
/** The helmets (knights.js HELMETS), as the settings name them. */
export const HELMETS = { great: 'Great Helm', armet: 'Armet', bascinet: 'Bascinet' };
/** The dance moves (knightPose.js MOVES), as the settings name them. */
export const KNIGHT_MOVES = {
  nod: 'Nod', stepTouch: 'Step Touch', fistPump: 'Fist Pump', headbang: 'Headbang', swayArms: 'Sway', march: 'March',
  spin: 'Spin', jump: 'Jump', jumpingJack: 'Jumping Jacks', clap: 'Clap', stomp: 'Stomp', praise: 'Praise the Sun',
  defaultDance: 'Default Dance',
};
/** Each move's cycle in beats (knightPose.js MOVE_INFO): a canon spaces its dancers by it. */
export const MOVE_CYCLE = { nod: 2, stepTouch: 2, fistPump: 8, headbang: 2, swayArms: 2, march: 2, spin: 4, jump: 2, jumpingJack: 2, clap: 2, stomp: 2, praise: 1, defaultDance: 8 };
export const FORMATIONS = { ring: 'Round the Fire', line: 'Line', solo: 'Solo', canon: 'Canon' };
/** How they sit (knightPose.js seatedPose variants; fire.knights.setSeatPose). */
export const SEAT_POSES = { resting: 'Resting', watchful: 'Watchful' };
/**
 * Their style (the knightStyle setting; fire.knights.setStyle): the site's own (the admin's,
 * effects.knight.style) or one of knightStyles.js STYLES; 'mix' (In the mix) rolls one.
 */
export const KNIGHT_STYLES = /* @__PURE__ */ (() => ({ site: 'The Site’s Own', ...STYLE_NAMES }))();
// The moves for the bars right after a drop, and for the groove after that.
const BIG = ['jump', 'jumpingJack', 'spin', 'praise', 'fistPump', 'headbang'];
const GROOVE = ['nod', 'stepTouch', 'fistPump', 'headbang', 'swayArms', 'march', 'clap', 'stomp', 'spin', 'jumpingJack', 'defaultDance'];
// Gestures (knightPose.js GESTURES) for a big drop (Praise the Sun most of all) and a small one.
const DROP_GESTURES = ['praise', 'praise', 'praise', 'hurrah', 'joy', 'point'];
const CHEERS = ['hurrah', 'joy', 'wave', 'praise'];
// Random How Many: one or two more often than three or four.
const COUNTS = [1, 1, 2, 2, 3, 4];
// How long a dance in the mix may run (bars; it still ends on a phrase line).
const DANCE_LENGTHS = [8, 16, 16, 24];
// Where dancers stand on the ring (its clear sides, knightPlaces.js), at least this far apart,
// and this far from a knight sitting one out (m: arms out for a jumping jack).
export const APART = 0.5;
// In the mix, how likely each is on for a stretch (rolled at the hidden moments): the rest
// sweeps and the flare sweeps over the armor (apart), and the reactions.
const SHINE_REST = 0.6;
const SHINE_FLARES = 0.75;
const REACTIONS = 0.7;
// Armor Finish in the mix: any of them, leaning to gunmetal (his own look; twice as likely).
const FINISH_MIX = /* @__PURE__ */ (() => ['gunmetal', ...Object.keys(FINISHES)])();
// Style in the mix: any of them, leaning to the site's default (twice as likely).
const STYLE_MIX = /* @__PURE__ */ (() => [DEFAULT_STYLE, ...STYLE_KEYS])();
// Edge Glow in the mix: how likely a stretch glows, and its strength's spread round the
// Glow Strength set (0.6× to 1.4× of it, kept to 0..1).
const RIM_ON = 0.75;
const RIM_SPREAD = [0.6, 1.4];
const RAD = Math.PI / 180;

const clamp01 = (x) => Math.min(1, Math.max(0, x));
/** Every order of 0..n-1 (n ≤ 4: at most 24). */
function orders(n) {
  if (n <= 1) return [[...Array(n).keys()]];
  return orders(n - 1).flatMap((o) => Array.from({ length: n }, (_, k) => [...o.slice(0, k), n - 1, ...o.slice(k)]));
}

/** The least distance between any two places (m). */
const closest = (places) => {
  let d = Infinity;
  for (let i = 0; i < places.length; i++) for (let j = i + 1; j < places.length; j++) d = Math.min(d, Math.hypot(places[i].x - places[j].x, places[i].z - places[j].z));
  return d;
};
/** The places in order, less any closer than APART to one kept before it. */
const apartOnly = (places) => places.reduce((kept, p) => (kept.every((q) => Math.hypot(p.x - q.x, p.z - q.z) >= APART) ? [...kept, p] : kept), []);

/**
 * A ring's clear arcs ([[from°, to°], …], `to` may pass 360) less `cuts` ([lo°, hi°], any
 * turn of the circle).
 * @param {number[][]} free
 * @param {number[][]} cuts
 */
export function cutArcs(free, cuts) {
  let arcs = free.map(([a, b]) => [a, b]);
  for (const [lo, hi] of cuts) {
    arcs = arcs.flatMap(([a, b]) => {
      let parts = [[a, b]];
      for (const k of [-360, 0, 360, 720]) {
        parts = parts.flatMap(([p, q]) => (hi + k <= p || lo + k >= q ? [[p, q]] : [[p, lo + k], [hi + k, q]].filter(([x, y]) => y > x)));
      }
      return parts;
    });
  }
  return arcs;
}
/**
 * The ring less the arcs where a place would be nearer than APART to one of `sitters`
 * (world { x, z }: knights sitting this one out), or null when that leaves none of it.
 * @param {{ center: { x: number, z: number }, radius: number, free: number[][] }} ring
 * @param {{ x: number, z: number }[]} sitters
 */
export function ringAround(ring, sitters) {
  const r = ring.radius;
  const cuts = [];
  for (const s of sitters) {
    const dx = s.x - ring.center.x, dz = s.z - ring.center.z;
    const rs = Math.hypot(dx, dz);
    // (A place at bearing b is APART from him when cos(b − his bearing) ≤ c.)
    const c = rs > 1e-6 ? (rs * rs + r * r - APART * APART) / (2 * rs * r) : -1;
    if (c >= 1) continue;
    const half = Math.acos(Math.max(-1, c)) / RAD + 1;
    const b = Math.atan2(dx, dz) / RAD;
    cuts.push([b - half, b + half]);
  }
  const free = cutArcs(ring.free, cuts);
  return free.length ? { ...ring, free } : null;
}

/** How many of `n` knights dance with the director's `budget` (0..1). */
export const dancersFor = (n, budget = 1) => (n < 1 ? 0 : Math.min(n, Math.max(1, Math.round(n * (0.4 + 0.6 * clamp01(budget))))));

/**
 * The knights' show. `settings` is read live (the Knights tab: knights, knightCount,
 * knightDance, knightFormation, knightMoves, knightHelmets, danceBars, knightCam,
 * knightSummon, knightGestures, knightShine, knightReactions, knightStyle, knightFinish,
 * knightGlow, knightRim, knightSeat; and a scene's knightHelmetOrder). `clock`: the director's bar
 * clock (bars.js), for New Move Every. Every call takes the scene's knights (fire.knights)
 * first; with none (no model), nothing happens.
 * @param {Record<string, any>} settings
 * @param {{ clock?: { bars: (key: string) => number, reroll: (key: string) => void } | null, reducedMotion?: boolean, rng?: () => number }} [o]
 */
export function createKnightShow(settings, { clock = null, reducedMotion = false, rng = Math.random } = {}) {
  const pickR = (a) => a[Math.floor(rng() * a.length)];
  const shuffleR = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  // What each knight is doing, as far as the show asked: away | sit | nod (seated, nodding
  // along) | ready (up for the drop) | dance; and how.
  const K = Array.from({ length: MAX_KNIGHTS }, (_, i) => ({
    want: i === 0 ? 'sit' : 'away', move: 'nod', place: null, facing: 'front', offset: 0, seed: i * 7 + 3, energy: 0.7,
  }));
  let inited = false;
  let started = false;     // the music has started (the start screen only has the resting knight)
  let inn = true;          // the knights are by the fire
  let cast = 1;            // how many, while they are
  let mode = 'rest';       // rest | watch (a breakdown stopped the dance) | ready (up for a drop) | dance
  let fromDrop = false;    // this dance began on a big drop (its first two bars are big moves)
  let sinceBig = Infinity; // bars since the last big drop
  let danceBars = 0, danceLen = 16, moveBars = 0, lowBars = 0, highBars = 0, grooveBars = 0, offBars = 0;
  let dancers = 0;         // how many are up, counted again on phrase lines
  let forced = false;      // K: this dance runs its phrase whatever the energy
  let formation = 'line';
  let facing = 'front';
  let ringStep = 0;
  let ringDir = 1;
  let camOn = false;       // the cuts visit the dancers this dance (Knight Cameras)
  let tremble = 1;         // the ready bounce's speed (2: the build's last stretch)
  let strong = 0;          // strong beats in a row (the seated nods start after two)
  let weak = 0;            // ...and weak ones (they stop after two)
  let nodding = false;
  let pendingSit = false;  // a breakdown began: stop dancing on the next downbeat
  let watchBars = 0;       // bars they've watched a breakdown
  let pendingStart = false; // the energy came back without a drop: up on the next downbeat
  let pendingIn = null;    // Shift+K with a drop coming: in (true) or out (false) on its flash
  let dropFrame = false;   // a big drop this frame (a scenery change with it is part of it)
  let scenery = null;
  let beatNow = 0;
  let period = 0.5;
  let t = 0;               // seconds (the show's own clock, for gestures going round)
  let dropT = -Infinity;   // when the last big drop landed (s)
  let lastFlinch = -Infinity;
  let lastBudget = 1;
  let shine = { rest: true, flares: true }; // the armor's sweeps, as last rolled (Armor Shine)
  let reacting = true;     // they react to the fire and the blade (Reactions), as last rolled
  let finish = null;       // the armor's finish (Armor Finish), as last rolled
  let seatPose = null;     // how they sit (Seat Pose), as last rolled
  let rim = null;          // how strongly their edges glow (Edge Glow), as last rolled
  let style;               // their style (Style), as last rolled (null: the site's own)
  let last = null;         // the knight settings last acted on
  const gestures = [];     // a gesture going round the dancers on the beat: [{ i, name, at (s) }]

  const ready = (kn) => !!kn && kn.max > 0;
  const maxOf = (kn) => Math.min(MAX_KNIGHTS, kn.max || MAX_KNIGHTS);
  const danceMode = () => (reducedMotion ? 'off' : modeOf(settings.knightDance));
  /** A switch is on this time: always, or in the mix and rolled on (`chance`). */
  const active = (key, chance) => { const m = modeOf(settings[key]); return m === 'on' || (m === 'mix' && rng() < chance); };
  const here = (e) => !!e?.present && e.state !== 'leaving';
  // (Not there, or burning away because the show sent him: an ember walk to a far place
  // burns away too, but he's still coming.)
  const gone = (e, i) => !e?.present || (e.state === 'leaving' && K[i].want === 'away');
  function countFor(kn) {
    const v = settings.knightCount;
    const n = v === 'random' ? pickR(COUNTS) : Math.round(Number(v)) || 1;
    return Math.max(1, Math.min(maxOf(kn), n));
  }
  const helmetsOn = () => {
    const on = Object.keys(HELMETS).filter((h) => settings.knightHelmets?.[h] !== false);
    return on.length ? on : Object.keys(HELMETS);
  };
  /** A scene's helmet for knight i (knightHelmetOrder), or null: drawn. */
  const orderFor = (i) => {
    const h = settings.knightHelmetOrder?.[i];
    return HELMETS[h] ? h : null;
  };
  /**
   * Knight i's helmet: the scene's for him; else the one he wears if it's still switched on
   * (unless re-rolled), else a new draw.
   */
  const helmetFor = (e, reroll, i) => orderFor(i) ?? (!reroll && here(e) && helmetsOn().includes(e.helmet) ? e.helmet : pickR(helmetsOn()));
  /** In the mix: stay (or come) by the fire this time? Up for a drop they mostly stay. */
  const rollIn = () => (inn ? rng() < (mode === 'rest' ? 0.75 : 0.9) : rng() < 0.6);
  function movePool(big) {
    const on = Object.keys(KNIGHT_MOVES).filter((m) => settings.knightMoves?.[m] !== false);
    const all = on.length ? on : Object.keys(KNIGHT_MOVES);
    const pool = all.filter((m) => (big ? BIG : GROOVE).includes(m));
    return pool.length ? pool : all;
  }
  function rollFormation() {
    const f = settings.knightFormation;
    formation = FORMATIONS[f] ? f : pickR(Object.keys(FORMATIONS).filter((k) => k !== formation));
    facing = formation === 'ring' ? (rng() < 0.6 ? 'fire' : 'front') : 'front';
    ringStep = 0;
    ringDir = rng() < 0.5 ? -1 : 1;
  }
  /**
   * Armor Shine, Reactions and the options for the stretch ahead (at a hidden moment, or
   * when one is changed by hand: `which` 'shine' | 'reactions' | 'style' | 'finish' | 'rim' |
   * 'seat' | 'all'). In the mix the rest sweeps, the flare sweeps, the reactions, the style,
   * the finish and the seat pose are each rolled on their own. At a hidden moment ('all') a
   * new style is there at once, in the flash; by hand it burns them away and forms them in it.
   */
  function rollArmor(kn, which = 'all') {
    const all = which === 'all';
    if (all || which === 'style') {
      const s = settings.knightStyle;
      const next = s === 'mix' ? pickR(STYLE_MIX) : Object.hasOwn(STYLES, s) ? s : null;
      if (next !== style) {
        style = next;
        kn.setStyle?.(style, { instant: all || reducedMotion });
      }
    }
    if (all || which === 'shine') {
      const m = modeOf(settings.knightShine);
      shine = m === 'mix' ? { rest: rng() < SHINE_REST, flares: rng() < SHINE_FLARES } : { rest: m === 'on', flares: m === 'on' };
      kn.setShine?.(shine);
    }
    if (all || which === 'reactions') {
      reacting = active('knightReactions', REACTIONS);
      kn.setReactions?.(reacting);
    }
    if (all || which === 'finish') {
      const f = settings.knightFinish;
      finish = Object.hasOwn(FINISHES, f) ? f : pickR(FINISH_MIX);
      kn.setFinish?.(finish);
    }
    if (all || which === 'rim') {
      rim = rollRim();
      kn.setRim?.(rim);
    }
    if (all || which === 'seat') {
      const s = settings.knightSeat;
      seatPose = Object.hasOwn(SEAT_POSES, s) ? s : pickR(Object.keys(SEAT_POSES));
      kn.setSeatPose?.(seatPose);
    }
  }
  /** Glow Strength (knightRim) as a number 0..1. */
  const rimOf = () => {
    const v = Number(settings.knightRim);
    return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0.5;
  };
  /** Edge Glow's switch (missing: Always, at the strength set, as before it had one). */
  const glowMode = () => modeOf(settings.knightGlow ?? 'on');
  /**
   * Edge Glow for the stretch ahead: Off none, Always the strength set, In the mix a stretch
   * that glows (RIM_ON) at a strength rolled round the one set (RIM_SPREAD), or none.
   */
  function rollRim() {
    const m = glowMode();
    if (m === 'off') return 0;
    if (m === 'on') return rimOf();
    if (!(rng() < RIM_ON)) return 0;
    const [lo, hi] = RIM_SPREAD;
    return Math.round(clamp01(rimOf() * (lo + rng() * (hi - lo))) * 100) / 100;
  }

  // --- presence ------------------------------------------------------------------------
  /** Where knight i (≥ 1) rests with `n` by the fire (restPlaces), or null. */
  function restFor(kn, n, i) {
    const ring = kn.slots?.(scenery ?? undefined);
    const seat = kn.list[0];
    return ring ? restPlaces(ring, n, seat?.present && seat.state === 'sitting' ? seat.position : null)[i - 1] ?? null : null;
  }
  /**
   * Knight i by the fire, seated: the first on his seat; the others form at their places on
   * the ring (`at`, else restFor: the same restPlaces the knights module homes them at, but
   * for the show's own count of the cast) and sit down there.
   */
  function bringSeated(kn, i, n, { instant = false, at = i > 0 ? restFor(kn, n, i) : null } = {}) {
    if (!at) { kn.summon(i, { instant }); return; }
    kn.summon(i, { instant, at: { x: at.x, z: at.z }, facing: 'fire' });
    kn.sit(i);
  }
  /**
   * The first `n` by the fire, seated (new ones forming out of embers), the rest gone; any
   * up on their feet sit back down (`keepUp`: they stay up, the caller has them take new
   * places). `reroll`: the chance each draws a new helmet (only where it's hidden: they're
   * forming). `replace`: the others move to their places (after a new scenery, forming there
   * anyway).
   */
  function seat(kn, n, { instant = false, reroll = 0, replace = false, keepUp = false } = {}) {
    const list = kn.list;
    for (let i = 0; i < maxOf(kn); i++) {
      const e = list[i];
      const k = K[i];
      if (i >= n) { if (e?.present) kn.dismiss(i, { instant }); k.want = 'away'; continue; }
      const away = gone(e, i);
      const up = k.want === 'dance' || k.want === 'ready' || k.want === 'watch';
      const helmet = helmetFor(e, away || rng() < reroll, i);
      if (helmet !== e?.helmet) kn.setHelmet(helmet, { index: i, instant: true });
      if (away) { bringSeated(kn, i, n, { instant }); k.want = 'sit'; continue; }
      if (replace && i > 0 && !(keepUp && up)) { kn.dismiss(i, { instant: true }); bringSeated(kn, i, n, { instant }); k.want = 'sit'; continue; }
      if (e?.state === 'leaving') kn.summon(i);
      if (up && keepUp) continue;
      if (up) kn.sit(i);
      k.want = k.want === 'nod' ? 'nod' : 'sit';
    }
    mode = 'rest';
  }
  /** At a hidden moment: anyone wearing a helmet no longer switched on (or not the scene's for him) changes it at once. */
  function fixHelmets(kn) {
    kn.list.forEach((e, i) => {
      if (i >= maxOf(kn) || !here(e)) return;
      const want = helmetFor(e, false, i);
      if (want !== e.helmet) kn.setHelmet(want, { index: i, instant: true });
    });
  }
  function goAway(kn, { instant = false } = {}) {
    kn.setCast({ count: 0, instant });
    for (const k of K) k.want = 'away';
    mode = 'rest';
    tremble = 1;
    camOn = false;
  }
  function sitAll(kn) {
    for (let i = 0; i < maxOf(kn); i++) {
      const k = K[i];
      if (k.want === 'dance' || k.want === 'ready' || k.want === 'nod' || k.want === 'watch') { kn.sit(i); k.want = 'sit'; }
    }
    mode = 'rest';
    tremble = 1;
    fromDrop = forced = false;
    camOn = false;
    pendingSit = false;
    nodding = false;
    dancers = 0;
  }

  // --- places and moves ---------------------------------------------------------------
  /**
   * Where the knights from `m` on sit this one out (a Map of index → world { x, z }): where
   * they are (sitting, or about to sit down where they stand), or for one brought back,
   * where he'll rest. Those past the cast are leaving and don't count.
   */
  function sittersFrom(kn, m) {
    const list = kn.list;
    const out = new Map();
    for (let j = m; j < Math.min(cast, maxOf(kn)); j++) {
      const p = gone(list[j], j) ? restFor(kn, cast, j) : list[j].position;
      if (p) out.set(j, { x: p.x, z: p.z });
    }
    return out;
  }
  /**
   * Places for `m` dancers in the formation, kept APART from the knights sitting this one
   * out (`sitters`, sittersFrom) and shared out so they walk as little as they can altogether
   * (nobody crossing in front of the fire to swap sides; one forming out of embers can go
   * anywhere). Line, Solo and Canon take the whole cast's layout less the sitters' places, so
   * the dancers keep theirs when the count drops on a phrase line and the first takes the
   * one by his seat (the one the rest layout leaves him). Round the Fire spreads them over the
   * ring's clear sides less the sitters'. With too little room for them all, the ones left
   * over sit it out (null).
   * @returns {({ x: number, z: number, bearing: number, ring: any } | null)[]}
   */
  function placesFor(kn, m, sitters = new Map()) {
    const ring = kn.slots?.(scenery ?? undefined);
    if (!ring || m < 1) return [];
    const seated = [...sitters.values()];
    const clear = (p) => seated.every((s) => Math.hypot(p.x - s.x, p.z - s.z) >= APART);
    const open = seated.length ? ringAround(ring, seated) : ring;
    let places = null;
    if (formation === 'ring' && open) {
      const round = ringPlaces(open, m, ringStep);
      if (round.length === m && closest(round) >= APART && round.every(clear)) places = round;
    }
    if (!places) {
      const layout = slotPlaces(ring, Math.max(m, Math.min(cast, MAX_KNIGHTS))).filter(clear);
      if (layout.length >= m) places = layout;
    }
    if (!places && open) {
      // (The sitters aren't where the layout rests them: a layout, or a spread, round them.)
      const alt = slotPlaces(open, m).filter(clear);
      places = alt.length >= m && closest(alt) >= APART ? alt : apartOnly(ringPlaces(open, m, 0).filter(clear));
    }
    if (!places) places = [];
    const list = kn.list;
    const from = Array.from({ length: m }, (_, i) => {
      if (gone(list[i], i)) return null;
      const up = K[i].want === 'dance' || K[i].want === 'ready';
      return (up && K[i].place) || list[i]?.position || null;
    });
    let best = [];
    let bestD = Infinity;
    for (const o of orders(places.length)) {
      let d = 0;
      for (let i = 0; i < Math.min(m, o.length); i++) if (from[i]) d += Math.hypot(places[o[i]].x - from[i].x, places[o[i]].z - from[i].z);
      if (d < bestD - 1e-9) { bestD = d; best = o; }
    }
    return from.map((_, i) => (best[i] != null ? { ...places[best[i]], ring } : null));
  }
  /**
   * Everyone to their part: the first `m` (by the budget, counted again on phrase lines or
   * with new moves) dance at their places, the rest of the cast nod along seated, the rest
   * leave. `moves`: 'big' | 'groove' (new ones) | 'keep'. `leap`: those not already there
   * are up and in place at once (the drop's flash).
   */
  function arrange(kn, { budget = lastBudget, moves = 'keep', leap = false, energy = null, recount = false } = {}) {
    const list = kn.list;
    if (recount || !dancers) dancers = dancersFor(cast, budget);
    const m = dancers;
    const sitters = sittersFrom(kn, m);
    const places = placesFor(kn, m, sitters);
    const pool = movePool(moves === 'big');
    const was = K.find((o) => o.want === 'dance')?.move;
    const fresh = pool.filter((mv) => mv !== was);
    // (The drop's own beat: they all leap, Solo too; each his own move from the next bar.)
    const leapNow = moves === 'big' && fromDrop && sinceBig === 0 && pool.includes('jump');
    const lead = leapNow ? 'jump' : pickR(fresh.length ? fresh : pool);
    const solo = shuffleR([...pool]);
    for (let i = 0; i < maxOf(kn); i++) {
      const k = K[i];
      const e = list[i];
      if (i >= cast) {
        if (e?.present) kn.dismiss(i);
        k.want = 'away';
        continue;
      }
      if (i >= m || !places[i]) {
        // Sitting this one out (nodding along if the beat's strong).
        if (gone(e, i)) {
          if (!e?.present) kn.setHelmet(helmetFor(e, true, i), { index: i, instant: true });
          bringSeated(kn, i, cast, { at: sitters.get(i) ?? null });
          k.want = 'sit';
        } else if (k.want === 'dance' || k.want === 'ready') { kn.sit(i); k.want = 'sit'; }
        continue;
      }
      const joining = k.want !== 'dance';
      let move = k.move;
      if (moves !== 'keep' || joining) {
        move = leapNow ? lead : formation === 'solo' ? solo[i % solo.length] : moves === 'keep' ? (was ?? lead) : lead;
        k.seed = Math.floor(rng() * 64);
      }
      // (Up for the drop already, they leap facing the way they stood; they turn on the next bar.)
      const f = k.want === 'ready' && fromDrop && sinceBig === 0 ? k.facing
        : formation === 'solo' ? (joining || moves !== 'keep' ? pickR(['front', 'front', 'fire']) : k.facing) : facing;
      const offset = formation === 'canon' ? i * (MOVE_CYCLE[move] >= 4 ? 1 : 0.5) : 0;
      const place = places[i];
      if (gone(e, i)) {
        if (!e?.present) kn.setHelmet(helmetFor(e, true, i), { index: i, instant: true });
        else kn.summon(i); // (sent away, burning out: back)
      }
      const there = k.want === 'ready' && k.place && Math.hypot(k.place.x - place.x, k.place.z - place.z) < 0.05;
      if (leap && !there) {
        // Up and in place in the flash.
        if (kn.list[i]?.present) kn.dismiss(i, { instant: true });
        kn.summon(i, { instant: true, at: { x: place.x, z: place.z }, facing: f });
      }
      Object.assign(k, { want: 'dance', move, place, facing: f, offset, energy: energy ?? k.energy });
      // (On his feet: the knights module keeps a dance seated unless told, and he may be nodding in his seat.)
      kn.dance(i, { move, energy: k.energy, position: { x: place.x, z: place.z }, facing: f, offset, seed: k.seed, seated: false });
    }
  }
  function startDance(kn, { drop = false, force = false, budget = 1, keep = false, leapIn = false } = {}) {
    mode = 'dance';
    fromDrop = drop;
    forced = force;
    danceBars = moveBars = lowBars = offBars = 0;
    danceLen = force ? 8 : pickR(DANCE_LENGTHS);
    pendingSit = pendingStart = false;
    tremble = 1;
    nodding = false;
    if (!keep) rollFormation(); // (up for the drop already: the places they took)
    camOn = active('knightCam', 0.6);
    const leap = leapIn || (drop && active('knightSummon', 0.5));
    arrange(kn, { budget, moves: drop ? 'big' : 'groove', leap, energy: drop ? 1 : 0.8, recount: true });
    if (drop && active('knightGestures', 0.6)) dropGesture(kn);
  }
  /** A drop's gesture: all at once, or going round the dancers a beat apart. */
  function dropGesture(kn) {
    const name = pickR(DROP_GESTURES);
    if (rng() < 0.6) { kn.gesture(name, { index: 'all' }); return; }
    const order = K.map((k, i) => i).filter((i) => K[i].want === 'dance' || K[i].want === 'sit');
    order.forEach((i, j) => gestures.push({ i, name, at: t + j * period }));
  }
  /** A breakdown stops the dance: the others sit down where they are; the first stands and watches. */
  function watch(kn) {
    for (let i = 0; i < maxOf(kn); i++) {
      const k = K[i];
      if (k.want !== 'dance' && k.want !== 'ready') continue;
      if (i === 0) { kn.stand(0); k.want = 'watch'; } else { kn.sit(i); k.want = 'sit'; }
    }
    mode = 'watch';
    watchBars = 0;
    tremble = 1;
    fromDrop = forced = false;
    camOn = false;
    dancers = 0;
  }
  /** Up for the drop: everyone by the fire gets up and takes his place, bouncing, facing the fire. */
  function readyUp(kn) {
    const list = kn.list;
    const up = list.filter((e, i) => i < maxOf(kn) && !gone(e, i)).length;
    if (!up) return false;
    pendingSit = false;
    mode = 'ready';
    const places = placesFor(kn, up);
    for (let i = 0; i < maxOf(kn); i++) {
      const place = places[i];
      if (gone(list[i], i) || !place) continue;
      Object.assign(K[i], { want: 'ready', move: 'nod', place, facing: 'fire', offset: 0, energy: 0.3 });
      kn.dance(i, { move: 'nod', energy: 0.3, position: { x: place.x, z: place.z }, facing: 'fire', offset: 0, seed: K[i].seed, seated: false });
    }
    return true;
  }

  // --- the moments --------------------------------------------------------------------
  function init(kn) {
    inited = true;
    const m = modeOf(settings.knights);
    inn = m !== 'off';
    cast = m === 'on' ? countFor(kn) : 1;
    if (inn) seat(kn, cast, { instant: true, reroll: 1 });
    else goAway(kn, { instant: true });
    rollArmor(kn);
    last = knightSettings();
  }
  const knightSettings = () => ({
    k: modeOf(settings.knights), c: String(settings.knightCount), d: danceMode(), h: helmetsOn().join(),
    o: (settings.knightHelmetOrder ?? []).join(), s: modeOf(settings.knightShine), r: modeOf(settings.knightReactions),
    f: String(settings.knightFinish), rim: `${glowMode()} ${rimOf()}`, seat: String(settings.knightSeat), st: String(settings.knightStyle),
  });
  /** The Knights settings changed (by hand): act at once. */
  function sync(kn) {
    const now = knightSettings();
    if (now.k !== last.k) {
      if (now.k === 'off' && inn) { inn = false; pendingIn = null; goAway(kn); }
      else if (now.k === 'on' && !inn) { inn = true; cast = countFor(kn); seat(kn, cast); }
    }
    if (now.c !== last.c && inn) {
      cast = countFor(kn);
      if (mode === 'dance') arrange(kn, { recount: true });
      else {
        // (Up for a drop, or one watching the blade: they stay up, and take the new count's places.)
        const was = mode;
        seat(kn, cast, { keepUp: was === 'ready' || was === 'watch' });
        if (was === 'ready') readyUp(kn);
        else if (was === 'watch') mode = 'watch';
      }
    }
    if (now.d !== last.d && now.d === 'off' && mode !== 'rest') sitAll(kn);
    if (now.h !== last.h || now.o !== last.o) {
      const on = helmetsOn();
      kn.list.forEach((e, i) => {
        if (!here(e)) return;
        const want = orderFor(i) ?? (on.includes(e.helmet) ? e.helmet : pickR(on));
        if (want !== e.helmet) kn.setHelmet(want, { index: i });
      });
    }
    if (now.s !== last.s) rollArmor(kn, 'shine');
    if (now.r !== last.r) rollArmor(kn, 'reactions');
    if (now.st !== last.st) rollArmor(kn, 'style');
    if (now.f !== last.f) rollArmor(kn, 'finish');
    if (now.rim !== last.rim) rollArmor(kn, 'rim');
    if (now.seat !== last.seat) rollArmor(kn, 'seat');
    last = now;
  }
  /**
   * A new scenery: a hidden moment of its own (unless it came with a drop, or the music
   * hasn't started), and new places. It takes the count, the helmets and the dance switch
   * as they stand (and, rolled, the rest of the Knights settings).
   */
  function changedScenery(kn, roll) {
    const rolled = roll && started;
    const took = () => {
      const now = knightSettings();
      last = rolled ? now : { ...last, c: now.c, d: now.d, h: now.h, o: now.o };
    };
    if (rolled) {
      rollArmor(kn);
      const m = modeOf(settings.knights);
      const next = pendingIn ?? (m === 'mix' ? rollIn() : m === 'on');
      pendingIn = null;
      if (!next) { if (inn) { inn = false; goAway(kn); } took(); return; }
      if (!inn) { inn = true; cast = countFor(kn); }
    }
    if (!inn) { took(); return; }
    if (String(settings.knightCount) !== last.c) cast = countFor(kn);
    fixHelmets(kn);
    if (mode === 'dance' && (danceMode() !== 'off' || forced)) arrange(kn, {});
    else {
      if (mode === 'dance') sitAll(kn);
      const wasReady = mode === 'ready';
      seat(kn, cast, { reroll: 0.5, replace: !wasReady, keepUp: wasReady });
      if (wasReady) readyUp(kn);
    }
    took();
  }

  return {
    /**
     * Every frame: the scene's knights, and { beatPos (the director's, eased), period,
     * scenery (fire.scenery), live (the music is playing) }. Brings them in once there are
     * knights, acts on changed settings and scenery, and keeps the build's bounce and a
     * gesture going round on the beat. (A show made while the music plays, after a rebuild,
     * never hears it start: the first live frame counts as its start, with who's by the
     * fire as it stands.)
     */
    update(kn, dt, { beatPos = 0, period: p = 0, scenery: sc = null, live = false } = {}) {
      if (!ready(kn)) return;
      beatNow = beatPos;
      t += dt;
      if (p > 0) period = p;
      if (!inited) { scenery = sc; init(kn); }
      if (live) started = true;
      sync(kn);
      if (sc && sc !== scenery) {
        const had = scenery != null;
        scenery = sc;
        if (had) changedScenery(kn, !dropFrame);
      }
      dropFrame = false;
      if (reducedMotion) return;
      // The last stretch of a build: the ready bounce at double speed (on the grid: its
      // beats land on the eighths).
      if (tremble > 1 && mode === 'ready') {
        for (let i = 0; i < maxOf(kn); i++) if (K[i].want === 'ready') kn.dance(i, { offset: -(tremble - 1) * beatPos, energy: 0.5 });
      }
      for (let j = gestures.length - 1; j >= 0; j--) {
        if (t < gestures[j].at) continue;
        kn.gesture(gestures[j].name, { index: gestures[j].i });
        gestures.splice(j, 1);
      }
    },
    /**
     * The music started: who's by the fire (rolled in the mix), under the intro. Anyone
     * still up from before (a new source mid-dance) sits back down. `scenery`: the scene it
     * starts in, when the start brings a new one (a preset scene: set first, so they take its
     * places and there's no second moment for it a frame later).
     */
    start(kn, { scenery: sc = null } = {}) {
      started = true;
      if (sc) scenery = sc;
      if (!ready(kn) || !inited) return;
      if (mode !== 'rest' || nodding) sitAll(kn);
      gestures.length = 0;
      rollArmor(kn);
      const m = modeOf(settings.knights);
      inn = pendingIn ?? (m === 'mix' ? rng() < 0.75 : m === 'on');
      pendingIn = null;
      if (!inn) goAway(kn);
      else {
        cast = countFor(kn);
        seat(kn, cast);
      }
      last = knightSettings(); // (the settings as they stand: nothing to act on a frame later)
    },
    /** Silence (or the music taken away: a new source): everyone sits, at once. */
    silence(kn) {
      pendingStart = pendingSit = false;
      gestures.length = 0;
      if (ready(kn) && inited) sitAll(kn);
    },
    /** A breakdown (or a build) began: dancers stop on the next downbeat (watch()); the nods stop. */
    low(kn) {
      if (!ready(kn) || !inited) return;
      if (mode === 'dance') pendingSit = true;
      pendingStart = false;
      fromDrop = false;
      strong = 0;
      if (nodding) { nodding = false; K.forEach((k, i) => { if (k.want === 'nod') { kn.sit(i); k.want = 'sit'; } }); }
    },
    /** The energy came back without a drop: up on the next downbeat if it's strong. */
    back(kn, { intensity = 0 } = {}) {
      if (!ready(kn) || !inited || !inn || danceMode() === 'off') return;
      if (mode === 'ready' || intensity > 0.7) pendingStart = true;
      pendingSit = false;
    },
    /** A build's stage (1–4): up and in place at the third, bouncing faster at the fourth. */
    stage(kn, n) {
      if (!ready(kn) || !inited || reducedMotion || !inn || danceMode() === 'off') return;
      if (n >= 3 && mode !== 'ready') {
        if (mode === 'rest') rollFormation(); // (stopped for the breakdown: the places they had)
        readyUp(kn);
      }
      if (n >= 4 && mode === 'ready') tremble = 2;
    },
    /**
     * A drop. Big: who's by the fire is rolled in its flash (a Shift+K waiting for it wins),
     * and they leap into the dance on its first beat. `scenery`: the scene it lands in, when
     * the drop brings a new one (the director changes it first, so the dancers take its
     * places). Small: one cheer (with Gestures on Drops).
     */
    drop(kn, kind = 'big', { budget = 1, scenery: sc = null } = {}) {
      if (!ready(kn) || !inited) return;
      if (kind === 'small') {
        if (!reducedMotion && inn && danceMode() !== 'off' && active('knightGestures', 0.6)) kn.gesture(pickR(CHEERS), { index: 'all' });
        return;
      }
      if (sc) scenery = sc;
      started = true;
      sinceBig = 0;
      dropT = t;
      dropFrame = true;
      tremble = 1;
      lastBudget = budget;
      rollArmor(kn);
      const wasReady = mode === 'ready';
      const m = modeOf(settings.knights);
      const next = pendingIn ?? (m === 'mix' ? rollIn() : m === 'on');
      pendingIn = null;
      if (!next) {
        inn = false;
        goAway(kn);
      } else {
        if (!inn || (settings.knightCount === 'random' && !wasReady) || String(settings.knightCount) !== last.c) cast = countFor(kn);
        inn = true;
        fixHelmets(kn);
        if (danceMode() === 'off') {
          seat(kn, cast);
          if (!reducedMotion && active('knightGestures', 0.6)) kn.gesture(pickR(DROP_GESTURES), { index: 'all' });
        } else startDance(kn, { drop: true, budget, keep: wasReady });
      }
      last = knightSettings(); // (the settings as they stand: nothing to act on a frame later)
    },
    /**
     * A hidden moment on request (a preset scene arriving, in its flash): who's by the fire
     * (rolled in the mix), how many, each one's helmet (the scene's knightHelmetOrder, or
     * drawn anew), the armor's switches and options, all seated where they rest, and up
     * dancing at once if Dance is Always and the `groove` is on. `instant`: no forming out
     * of embers (the Painter). `scenery`: the scene it lands in, when the scene brings a new
     * one (set first, so they take its places, and no second moment for it a frame later).
     * Takes the settings as they stand, like every hidden moment.
     */
    retake(kn, { instant = false, groove = false, budget = 1, scenery: sc = null } = {}) {
      if (!ready(kn)) return;
      inited = true;
      if (sc) scenery = sc;
      gestures.length = 0;
      pendingIn = null;
      lastBudget = budget;
      if (mode !== 'rest' || nodding) {
        // (Up on his feet, the first is re-placed on his seat too: no walk back after the flash.)
        const up = K[0].want === 'dance' || K[0].want === 'ready' || K[0].want === 'watch';
        sitAll(kn);
        if (up && kn.list[0]?.present) { kn.dismiss(0, { instant: true }); K[0].want = 'away'; }
      }
      rollArmor(kn);
      const m = modeOf(settings.knights);
      inn = m === 'mix' ? rollIn() : m === 'on';
      if (!inn) goAway(kn, { instant });
      else {
        cast = countFor(kn);
        seat(kn, cast, { reroll: 1, replace: true, instant });
        if (groove && started && !reducedMotion && danceMode() === 'on') startDance(kn, { budget, leapIn: true });
      }
      last = knightSettings();
    },
    /** A beat on the grid: the seated ones nod along while the beats land hard. */
    beat(kn, { strength = 0, groove = true, low = false } = {}) {
      if (!ready(kn) || !inited || reducedMotion || !started) return;
      strong = strength > 0.35 ? strong + 1 : 0;
      weak = strength < 0.2 ? weak + 1 : 0;
      const allow = inn && groove && !low && danceMode() !== 'off';
      nodding = allow && (nodding ? weak < 2 : strong >= 2);
      const energy = 0.35 + 0.6 * clamp01(strength);
      for (let i = 0; i < maxOf(kn); i++) {
        const k = K[i];
        if (k.want === 'sit' && nodding) { k.want = 'nod'; kn.dance(i, { seated: true, move: 'nod', energy, seed: k.seed }); }
        else if (k.want === 'nod' && !nodding) { k.want = 'sit'; kn.sit(i); }
      }
    },
    /**
     * A bar's downbeat: `bar` (the grid's count, 0 at the drop), the director's `budget`,
     * the music's `intensity`, the beat's `strength`, whether the tempo is `locked`, and
     * whether it's the `groove` or a breakdown (`low`).
     */
    bar(kn, { bar = 0, budget = 1, intensity = 0, strength = 0, locked = false, groove = true, low = false } = {}) {
      if (!ready(kn) || !inited) return;
      // (The drop's own downbeat, just after it: the grid starts again from the drop.)
      if (t - dropT < 2 * period) return;
      sinceBig++;
      lastBudget = budget;
      const on = groove && locked && !low;
      grooveBars = on ? grooveBars + 1 : 0;
      highBars = on && intensity > 0.7 && strength > 0.35 ? highBars + 1 : 0;
      lowBars = intensity < 0.5 ? lowBars + 1 : 0;
      offBars = on ? 0 : offBars + 1;
      if (reducedMotion || !inn || !started) return;
      const dm = danceMode();
      const phrase = bar % 8 === 0;
      if (pendingSit) { if (mode === 'dance') watch(kn); pendingSit = false; return; }
      // Watching a breakdown that ends with no drop (or goes on and on): sit down.
      if (mode === 'watch' && (!low || ++watchBars > 16) && !pendingStart) { sitAll(kn); return; }
      if (mode === 'dance') {
        danceBars++;
        moveBars++;
        // (K's dance runs its phrase whatever the switch says: with Dance off too.)
        const over = forced ? danceBars >= danceLen
          : dm === 'off' ? true
          : dm === 'on' ? offBars >= 2
          : lowBars >= 2 || danceBars >= danceLen || offBars >= 2;
        if (over && (phrase || (!forced && dm === 'off') || offBars >= 2)) { sitAll(kn); return; }
        let moves = 'keep';
        if (fromDrop && sinceBig === 1) moves = 'big';
        else if (fromDrop && sinceBig === 2) { moves = 'groove'; moveBars = 0; }
        else if (moveBars >= (clock?.bars('danceBars') || 4)) {
          moves = 'groove';
          moveBars = 0;
          clock?.reroll('danceBars');
          if (settings.knightFormation === 'mix' && rng() < 0.3) rollFormation();
        }
        if (formation === 'ring' && danceBars % 2 === 0) { if (phrase) ringDir = -ringDir; ringStep += ringDir; }
        const energy = fromDrop && sinceBig < 2 ? 1 : 0.45 + 0.55 * clamp01(intensity);
        arrange(kn, { budget, moves, energy, recount: phrase });
        return;
      }
      // Up for a drop that never came, or the energy back: dance on this downbeat.
      const energetic = highBars >= 2 && (sinceBig !== Infinity || grooveBars >= 32);
      if (dm !== 'off' && on && (pendingStart || dm === 'on' || (dm === 'mix' && phrase && energetic && rng() < 0.5))) {
        startDance(kn, { budget });
        return;
      }
      if ((mode === 'ready' || mode === 'watch') && !low) { sitAll(kn); }
    },
    /**
     * The living blade struck near `point` ({ x, z }, world): whoever's within reach flinches
     * (with Reactions on for this stretch).
     */
    near(kn, point) {
      if (!ready(kn) || !point || reducedMotion || !reacting || typeof kn.react !== 'function' || beatNow - lastFlinch < 2) return false;
      const close = kn.list.some((e) => here(e) && Math.hypot(e.position.x - point.x, e.position.z - point.z) < 1.1);
      if (close) { kn.react('impact', 0.5, { at: point, radius: 1.1 }); lastFlinch = beatNow; }
      return close;
    },
    /** K: dance now (for a phrase, whatever Dance says), or sit back down. Returns 'dance', 'sit' or null. */
    danceNow(kn, { budget = 1 } = {}) {
      if (!ready(kn) || !inited || reducedMotion) return null;
      if (mode !== 'rest') { sitAll(kn); return 'sit'; }
      if (!inn) { inn = true; cast = countFor(kn); }
      started = true;
      startDance(kn, { force: true, budget });
      return 'dance';
    },
    /**
     * Shift+K: in or out. With a drop coming (`holding`: a blade held for it), on its flash;
     * otherwise at once (forming out of embers, or burning away). Returns 'in' | 'out' |
     * 'in-next' | 'out-next', or null.
     */
    toggle(kn, { holding = false } = {}) {
      if (!ready(kn) || !inited) return null;
      const next = !(pendingIn ?? inn);
      if (holding) { pendingIn = next; return next ? 'in-next' : 'out-next'; }
      pendingIn = null;
      inn = next;
      if (inn) { cast = countFor(kn); seat(kn, cast); } else goAway(kn);
      return inn ? 'in' : 'out';
    },
    /** For the page: { present, dancing, mode, text } ('' when none are by the fire). */
    get status() {
      const n = inited ? K.filter((k) => k.want !== 'away').length : 0;
      const up = K.filter((k) => k.want === 'dance').length;
      const one = n === 1;
      const text = !n ? ''
        : mode === 'dance' ? (up === n ? (one ? 'the knight dances' : `${n} knights dance`) : `${up} of ${n} knights dance`)
        : mode === 'ready' ? (one ? 'the knight is up' : 'the knights are up')
        : mode === 'watch' ? (one ? 'the knight watches the blade' : 'the knights watch the blade')
        : nodding ? (one ? 'the knight nods along' : 'the knights nod along')
        : one ? 'the knight rests' : `${n} knights rest`;
      return { present: n, dancing: up, mode, text };
    },
    /** How many are dancing now. */
    get dancing() { return K.filter((k) => k.want === 'dance').length; },
    /** The cuts may visit the dancers (Knight Cameras, rolled each dance). */
    get camOn() { return camOn && mode === 'dance'; },
    get formation() { return formation; },
    /** A Shift+K waiting for the next drop: true (in), false (out) or null. */
    get pendingIn() { return pendingIn; },
    /** Armor Shine as last rolled: { rest, flares } (the sweeps the armor runs). */
    get shine() { return { ...shine }; },
    /** Reactions as last rolled: whether they react to the fire and the blade. */
    get reactions() { return reacting; },
    /** The armor's finish as last rolled (steel.js FINISHES), and how they sit (SEAT_POSES). */
    get finish() { return finish; },
    get seatPose() { return seatPose; },
    /** Edge Glow as last rolled: the strength their edges glow at (0: none). */
    get rim() { return rim; },
    /** Their style as last rolled (knightStyles.js STYLES), or null: the site's own. */
    get style() { return style ?? null; },
  };
}
