// Firefly moves (the visualizer): how the fireflies move with the beat, on top of their
// own flight (fireflyShow.js does their light, and a breakdown's swirls). One move at a
// time, a new one every few bars:
//   swing    hop and swing around the fire, one way then the other
//   bounce   bob up and fall back, like a ball
//   dart     shoot off a short way and stop dead: up, down, left, right, toward or away
//   anyway   the same dash, in any direction at all: every angle round and every tilt
//            up or down, drawn back toward the fire when one strays too far or too low
//   compass  all together round the compass, a step a beat: right, up, left, down
//   zigzag   side to side, each its own way
//   scatter  each its own way, drawn back in when it strays
// Each firefly keeps its own time, so it isn't a drill (except the compass): it moves every
// half beat, beat or two beats, on the beat or off it, and a dash takes a quarter to most
// of that, so its speed follows the tempo; how far it goes varies too, further when the
// music is loud.
import { pick } from '../math.js';

/** The moves, as the menus name them (the settings' Firefly Dances). */
export const FLY_MOVES = {
  swing: 'Swing',
  bounce: 'Bounce',
  dart: 'Dart',
  anyway: 'Dart Any Way',
  compass: 'Compass',
  zigzag: 'Zigzag',
  scatter: 'Scatter',
};
const CARDINAL = ['up', 'down', 'left', 'right', 'toward', 'away'];
const COMPASS = ['right', 'up', 'left', 'down'];
const MAX_SPEED = 4; // m/s at the start of a dash
const STRAY = 1.9; // m from the fire (on the ground) past which a dash leans back in
const LOW = 0.35; // m: below this a dash leans upward, so it doesn't drive into the ground

/**
 * A direction for 'anyway': uniform over the whole sphere, leaned back toward the fire past
 * STRAY and upward below LOW (only as much as it takes, so it still reads as any way).
 * `rand` () => 0..1. Returns { x, y, z }, unit length.
 */
export function anyDirection(pos, center, rand = Math.random) {
  const y = rand() * 2 - 1;
  const a = rand() * Math.PI * 2;
  const r = Math.sqrt(1 - y * y);
  const d = { x: Math.cos(a) * r, y, z: Math.sin(a) * r };
  const ox = pos.x - center.x,
    oz = pos.z - center.z;
  const out = Math.hypot(ox, oz);
  if (out > STRAY && d.x * ox + d.z * oz > 0) {
    d.x -= (1.4 * ox) / out;
    d.z -= (1.4 * oz) / out;
  }
  if (pos.y < LOW && d.y < 0) d.y = -d.y * 0.5 + 0.3;
  const len = Math.hypot(d.x, d.y, d.z) || 1;
  d.x /= len;
  d.y /= len;
  d.z /= len;
  return d;
}

export function createFireflyMoves({ reducedMotion = false } = {}) {
  let move = 'swing';
  let fresh = false;
  const per = []; // per firefly: { every (beats), offset (beats), last, frac, len, side }

  function deal(p) {
    p.every = pick([0.5, 1, 1, 1, 2]);
    p.offset = Math.random() < 0.3 ? p.every / 2 : 0;
    p.last = null;
    p.frac = 0.25 + Math.random() * 0.45;
    p.len = 0.15 + Math.random() * 0.3;
    p.side = Math.random() < 0.5 ? -1 : 1;
  }
  function ensure(n) {
    while (per.length < n) {
      const p = {};
      deal(p);
      per.push(p);
    }
  }

  return {
    get move() {
      return move;
    },
    set(name) {
      if (!FLY_MOVES[name] || name === move) return;
      move = name;
      per.forEach(deal);
      fresh = true;
    },
    /** Another move from those switched on (`enabled`: { name: bool }). */
    next(enabled) {
      const pool = Object.keys(FLY_MOVES).filter((k) => enabled[k] && k !== move);
      if (pool.length) this.set(pick(pool));
    },
    /** A beat: the swing's hop (`dir` ±1 alternates the way round). The other moves keep their own time. */
    beat(strength, accent, fl, dir) {
      if (!fl || move !== 'swing') return;
      fl.dance(strength * (accent ? 0.8 : 0.5), { dir, lift: accent ? strength * 0.3 : 0 });
    },
    /** c: { beatPos (continuous, in beats), period (s), energy 0..1 }. */
    update(fl, c) {
      if (!fl || move === 'swing' || !c.period || reducedMotion) return;
      ensure(fl.flies.length);
      // A new move takes some of the resting ones up to join in.
      if (fresh) {
        fresh = false;
        fl.lift(() => Math.random() < 0.5);
      }
      const beat = Math.floor(c.beatPos + 1e-3);
      fl.flies.forEach((f, i) => {
        if (f.orbit || f.mode !== 'fly') return;
        const p = per[i];
        const every = move === 'compass' ? 1 : p.every;
        const offset = move === 'compass' ? 0 : p.offset;
        const idx = Math.floor((c.beatPos - offset) / every);
        if (idx === p.last) return;
        const first = p.last === null;
        p.last = idx;
        if (first) return;
        const span = every * c.period;
        const dist = p.len * (0.6 + 0.8 * c.energy);
        const dur = Math.max((3 * dist) / MAX_SPEED, span * p.frac);
        if (move === 'bounce') fl.dart(f, 'up', { dist: dist * 0.6, dur: span * 0.85, bounce: true });
        else if (move === 'dart') fl.dart(f, pick(CARDINAL), { dist, dur });
        else if (move === 'anyway') fl.dart(f, anyDirection(f.pos, fl.center), { dist, dur });
        else if (move === 'compass')
          fl.dart(f, COMPASS[((beat % 4) + 4) % 4], { dist: 0.3, dur: Math.max(0.23, span * 0.5) });
        else if (move === 'zigzag') {
          p.side = -p.side;
          fl.dart(f, p.side > 0 ? 'right' : 'left', { dist, dur });
        } else if (move === 'scatter') {
          const out = Math.hypot(f.pos.x - fl.center.x, f.pos.z - fl.center.z);
          fl.dart(f, out > STRAY ? 'in' : pick(['out', 'left', 'right', 'up', 'toward', 'away']), { dist, dur });
        }
      });
    },
  };
}
