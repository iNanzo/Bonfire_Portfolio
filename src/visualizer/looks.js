// Looks: the pixel pass's effects (scene.glitch → pixelPass.js), played as a set of
// styles that take turns, so it isn't always glitch. One look at a time; each answers
// the beat its own way and has its own burst for the big hits.
//
//   ember    clean: just the fire (the director's zoom punch and shake still land).
//   glitch   torn rows, an RGB split on the kick, crunchy pixels and static; tearing
//            more and more through a build.
//   echo     the last frame echoes out of the fire like a tunnel, and on downbeats the
//            flame's ramp colors cycle, old pixel-art palette animation style.
//   ripple   a shockwave ring pushes out of the fire on every kick.
//   kaleido  a kaleidoscope around the screen's center, spinning with the kicks, its
//            segments changing each phrase, with a light echo.
//   ink      downbeats flash the scene to 1-bit (dithered to the void and the flame's
//            core), over scanlines.
// In any look a breakdown frames itself: letterbox bars slide in and an iris closes
// around the fire as the build rises; the drop snaps it open.
// Full-screen flashes (the ink flash, the negative on drops) stay on downbeats and big
// hits, well under three a second.

export const LOOKS = { ember: 'Ember', glitch: 'Glitch', echo: 'Echo', ripple: 'Ripple', kaleido: 'Kaleido', ink: 'Ink' };

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const ease = (cur, target, tau, dt) => cur + (target - cur) * (1 - Math.exp(-dt / tau));

export function createLooks(g) {
  let look = 'ember';
  let slice = 0;
  let block = 0;
  let hitEnv = 0;       // the last big hit, decaying
  let kick = 0;
  let inkFor = 0;
  let invertFor = 0;
  let lastFlash = -Infinity;
  let cycleFor = 0;
  let cycleStep = 0;
  let spinFor = 0;      // echo's burst: the palette spinning
  let ripples = [];     // { t, s }
  let kaleSeg = 6;
  let kaleRot = 0;
  let kaleSpin = 0;
  let letterbox = 0;
  let iris = 2;
  let clock = 0;

  function reseed() { g.sliceSeed = Math.random() * 100; }

  return {
    get look() { return look; },
    set(name) {
      if (!LOOKS[name] || name === look) return;
      look = name;
      if (name === 'kaleido') kaleSeg = pick([4, 6, 8]);
    },
    /** Another look from those switched on. */
    next(enabled) {
      const pool = Object.keys(LOOKS).filter((k) => enabled[k] && k !== look);
      if (pool.length) this.set(pick(pool));
    },
    beat(s, accent, period = 0.5) {
      kick = Math.max(kick, s);
      if (s < 0.05) return;
      if (look === 'ripple' && s > 0.2) ripples.push({ t: 0, s: accent ? 1 : 0.6 * s });
      if (look === 'echo' && accent && s > 0.3) { cycleFor = period * 0.5; cycleStep = 1 + Math.floor(Math.random() * 3); }
      if (look === 'ink' && accent) inkFor = 0.09;
      if (look === 'kaleido' && accent) kaleSpin = Math.max(kaleSpin, 0.6 * s);
    },
    hat(s) {
      if (look === 'glitch' && s > 0.6 && Math.random() < 0.15) { slice = Math.max(slice, 0.2); reseed(); }
    },
    /** A big hit in the current look's style (drops, combos landing, rings, G). */
    bang(amount = 1, { flash = false } = {}) {
      hitEnv = Math.max(hitEnv, amount);
      if (look === 'glitch') { slice = Math.max(slice, amount); block = Math.max(block, amount); reseed(); }
      else if (look === 'echo') spinFor = 0.5 * amount;
      else if (look === 'ripple') for (let k = 0; k < 3; k++) ripples.push({ t: -k * 0.12, s: amount });
      else if (look === 'kaleido') { kaleSeg = pick([4, 6, 8, 10].filter((n) => n !== kaleSeg)); kaleSpin = Math.max(kaleSpin, 2 * amount); }
      else if (look === 'ink') inkFor = 0.22 * amount;
      if (flash && amount >= 0.9 && clock - lastFlash > 2) { lastFlash = clock; invertFor = 0.07; }
    },
    /** The glitch look's breakdown tension, and every look's framing. */
    update(dt, { amt, build, low, energy, scanlines, mirror }) {
      clock += dt;
      kick *= Math.exp(-dt / 0.14);
      hitEnv *= Math.exp(-dt / 0.5);
      slice *= Math.exp(-dt / 0.22);
      block *= Math.exp(-dt / 0.3);
      kaleSpin *= Math.exp(-dt / 0.4);
      inkFor -= dt;
      invertFor -= dt;
      cycleFor -= dt;
      spinFor -= dt;
      const L = look;

      // Glitch.
      if (L === 'glitch' && amt > 0 && build > 0.3 && Math.random() < dt * 6 * build) { slice = Math.max(slice, 0.25 + 0.5 * build); reseed(); }
      const gl = L === 'glitch' ? amt : 0;
      g.slice = gl * Math.min(1, slice);
      g.split = Math.round(gl * (1.6 * kick + 3 * hitEnv + 1.5 * build));
      g.block = 1 + Math.round(amt * 3 * block);
      g.wave = gl * (1.2 * build + 3 * hitEnv);
      g.noise = gl * (0.08 * build + 0.12 * hitEnv);

      // Echo (and a light one under the kaleidoscope).
      const echo = L === 'echo' ? 0.62 + 0.2 * energy + 0.2 * Math.max(0, spinFor) : L === 'kaleido' ? 0.4 : 0;
      g.feedback = Math.min(0.9, amt * echo);
      g.zoom = 1 + (L === 'echo' ? 0.012 + 0.03 * kick + 0.05 * hitEnv : 0.006);
      g.cycle = L === 'echo' && spinFor > 0 ? Math.floor(clock * 16) % 4 : cycleFor > 0 ? cycleStep : 0;

      // Ripple: rings out of the fire (radius as a fraction of the screen height).
      ripples = ripples.filter((r) => (r.t += dt) < 0.7);
      const front = ripples.filter((r) => r.t >= 0).at(-1);
      g.rippleR = front ? front.t * 1.6 : 0;
      g.rippleAmp = front && amt > 0 ? amt * 7 * front.s * (1 - front.t / 0.7) : 0;

      // Kaleidoscope.
      kaleRot += dt * (0.12 + 1.5 * kaleSpin);
      g.kaleido = L === 'kaleido' && amt > 0 ? kaleSeg : 0;
      g.kaleidoRot = kaleRot;

      // Ink.
      g.ink = L === 'ink' && inkFor > 0 ? Math.min(1, amt) : 0;
      g.scan = scanlines || L === 'ink' ? 0.22 : 0;
      g.mirror = mirror ? 1 : 0;
      g.invert = invertFor > 0 ? 1 : 0;

      // Framing in breakdowns: bars in, the iris closing with the build; snapping open.
      letterbox = ease(letterbox, low ? 0.09 : 0, low ? 0.8 : 0.15, dt);
      iris = low ? ease(Math.min(iris, 1.3), 0.95 - 0.5 * build, 0.6, dt) : ease(iris, 2, 0.12, dt);
      g.letterbox = letterbox < 0.004 ? 0 : letterbox;
      g.iris = iris > 1.95 ? 2 : iris;
    },
  };
}
