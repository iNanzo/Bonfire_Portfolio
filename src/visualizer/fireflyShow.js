// The fireflies' light show. They sit dark and blink hard on and off with the music:
// a firefly is either on or out, like the real thing, never a steady glow.
//
//   blink     each beat a random handful flash (more on the downbeat), each for its own
//             short time; the handful changes every beat.
//   species   each firefly has its own flash signature (one flash, a double, a triple,
//             one each bar) on its own offset in a two-bar cycle: always something
//             lighting somewhere, never all at once.
//   chase     a spark of light running around the fire once a bar (two when it's loud).
//   twinkle   hi-hats set a few off at random, flickering.
//   breathe   in a breakdown: a slow wave passing through them, lit a few at a time,
//             quickening with the build.
//   strobe    all of them flashing together on every beat (right after a drop).
// Patterns crossfade over a beat. Hats also make a lit firefly flicker.
// Movement: the beat makes them hop and swing around the fire (fireflies.dance), and a
// soft leash keeps them from drifting to the edges of the clearing. In a breakdown a
// random few (sometimes three, sometimes nearly half) swirl around a held blade, a few
// more gather in a loose ring, and the rest carry on roaming, different every time.
import { shuffle, TAU, wrap } from '../math.js';

const SPECIES = [[0], [0, 0.35], [0, 0.28, 0.56], [0, 4]];

export function createFireflyShow({ reducedMotion = false } = {}) {
  let pattern = 'blink';
  let prev = null;
  let fade = 1;
  let strobe = 0;
  let rolesFor = null; // which section the roles were dealt for
  const flies = []; // per firefly: { species, shift, on (s left lit), flick, role, ringR, ringY }

  function ensure(n) {
    while (flies.length < n) {
      const i = flies.length;
      flies.push({
        species: SPECIES[i % SPECIES.length],
        shift: Math.floor(Math.random() * 8) + Math.random() * 0.2,
        on: 0,
        flick: 0,
        role: 'free',
        ringR: Math.random(),
        ringY: Math.random(),
      });
    }
  }

  /** Deal roles for a section: a random few swirl round the blade, some ring the fire. */
  function deal(n, holding) {
    const order = shuffle([...Array(n).keys()]);
    const blade = holding ? 2 + Math.floor(Math.random() * Math.max(2, Math.round(n * 0.4) - 1)) : 0;
    const ring = Math.floor(Math.random() * Math.round(n * 0.35));
    order.forEach((idx, k) => {
      flies[idx].role = k < blade ? 'blade' : k < blade + ring ? 'ring' : 'free';
    });
  }

  // A firefly's light under a pattern: 0 (out) or about 1 (on). `c.beatPos` is in beats.
  function glowOf(name, s, f, c, i, n) {
    const beat = c.period || 0.5;
    switch (name) {
      case 'blink':
      case 'twinkle':
        return s.on > 0 ? 1 : 0;
      case 'species': {
        const x = wrap(c.beatPos + s.shift, 8);
        for (const ft of s.species) {
          const dx = (x - ft) * beat;
          if (dx >= 0 && dx < 0.11) return 1.1;
        }
        return 0;
      }
      case 'chase': {
        const theta = wrap(Math.atan2(f.pos.z - c.cz, f.pos.x - c.cx) / TAU, 1);
        const waves = c.energy > 0.7 ? 2 : 1;
        for (let k = 0; k < waves; k++) {
          const d = wrap(theta - wrap(c.beatPos / 4 + k / waves, 1) + 0.5, 1) - 0.5;
          if (d > -0.06 && d < 0.02) return 1;
        }
        return 0;
      }
      case 'breathe': {
        const cycle = 8 / (1 + 3 * c.build);
        const w = wrap(c.beatPos / cycle - i / n, 1);
        return w < 0.12 + 0.1 * c.build ? 0.9 : 0;
      }
      case 'strobe':
        return strobe > 0 ? 1.2 : 0;
      default:
        return 0;
    }
  }

  return {
    get pattern() {
      return pattern;
    },
    /** Change pattern, crossfading over about a beat. */
    set(name) {
      if (name === pattern) return;
      prev = pattern;
      pattern = name;
      fade = 0;
    },
    /** A beat: pick who blinks on it. */
    beat(strength, accent, fl, period = 0.5) {
      if (!fl) return;
      ensure(fl.flies.length);
      strobe = strength > 0.05 ? period * 0.3 : 0;
      if (pattern !== 'blink' && prev !== 'blink') return;
      const n = fl.flies.length;
      const count = Math.round(n * (accent ? 0.35 : 0.18) * (0.5 + strength));
      const order = shuffle([...Array(n).keys()]);
      for (let k = 0; k < count; k++) flies[order[k]].on = period * (0.25 + Math.random() * 0.45);
    },
    /** Hi-hats: in twinkle a few go off; any lit one flickers. */
    hat(strength, fl) {
      if (!fl) return;
      ensure(fl.flies.length);
      if (pattern === 'twinkle') {
        const n = 1 + Math.round(strength * 2 + Math.random());
        for (let k = 0; k < n; k++) flies[Math.floor(Math.random() * fl.flies.length)].on = 0.12 + Math.random() * 0.1;
      }
      for (const s of flies) if (s.on > 0) s.flick = 0.08;
    },
    /**
     * c: { t, beatPos (beats, continuous), period, energy 0..1, build 0..1, low (in a
     * breakdown/build), holding, cx, cz (the fire) }.
     */
    update(fl, dt, c) {
      if (!fl) return;
      const n = fl.flies.length;
      ensure(n);
      fade = Math.min(1, fade + dt / Math.max(0.2, c.period || 0.5));
      strobe -= dt;
      const section = c.low ? (c.holding ? 'held' : 'low') : 'groove';
      let dealt = false;
      if (section !== rolesFor) {
        rolesFor = section;
        if (c.low) deal(n, c.holding);
        else for (const s of flies) s.role = 'free';
        dealt = true;
      }

      fl.flies.forEach((f, i) => {
        const s = flies[i];
        s.on -= dt;
        s.flick -= dt;
        let g = glowOf(pattern, s, f, c, i, n);
        if (fade < 1 && prev) g = fade < 0.5 ? glowOf(prev, s, f, c, i, n) : g;
        // A flicker: a lit one stutters off for a frame or two.
        if (g > 0 && s.flick > 0 && (Math.floor(c.t * 40) + i) % 2) g = 0.1;
        // The ones swirling round a held blade glow faintly between blinks, so the swirl reads.
        if (s.role === 'blade' && g < 0.35) g = 0.35 + 0.25 * c.build;
        f.show = reducedMotion ? Math.min(g, 0.9) : g;
        f.heat = g > 0.5 ? Math.min(1, f.vel.length() * 0.35 + (pattern === 'strobe' ? 0.5 : 0)) : 0;

        // Movement.
        if (reducedMotion) {
          f.orbit = null;
          f.leash = null;
          return;
        }
        if (s.role === 'blade') {
          const r = (0.5 + 0.45 * s.ringR) * (1 - 0.3 * c.build);
          const w = (TAU / (Math.max(0.25, c.period || 0.5) * 8)) * (1 + 2.5 * c.build) * (i % 4 === 0 ? -1 : 1);
          f.orbit = { x: c.cx, y: 0.85 + 1.0 * s.ringY, z: c.cz, r, w, h: 0.08 };
        } else if (s.role === 'ring') {
          const w = (TAU / (Math.max(0.25, c.period || 0.5) * 16)) * (i % 2 ? 1 : -1);
          f.orbit = { x: c.cx, y: 0.5 + 0.9 * s.ringY, z: c.cz, r: 1.2 + 0.7 * s.ringR, w, h: 0.15 };
        } else {
          f.orbit = null;
        }
        f.leash = f.orbit ? null : { x: c.cx, z: c.cz, r: 2.1 };
      });
      // Those dealt a swirl or the ring take off their perches to join it.
      if (dealt) fl.lift((f) => !!f.orbit);
    },
    /** Hand the fireflies back to their own ways (no music, or the show turned off). */
    release(fl) {
      if (!fl) return;
      for (const f of fl.flies) {
        f.show = null;
        f.heat = 0;
        f.orbit = null;
        f.leash = null;
      }
      rolesFor = null;
    },
  };
}
