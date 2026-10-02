// A stand-in scene for the visualizer's tests: fire.knights as a log of who's where
// (fakeKnights), the scene as a Proxy that logs anything else (fakeFire), a director on it
// (directorFor), and a knight show on the stand-in knights with a few bars of music (showFor,
// play). Shared by knightShow.test.mjs and the scene engine's tests.
import { createKnightShow } from '../../src/visualizer/knightShow.js';
import { createBarClock } from '../../src/visualizer/bars.js';
import { DEFAULT_SETTINGS, createDirector } from '../../src/visualizer/director.js';
import { DANCE_RING, danceSlots } from '../../src/bonfire/scenery.js';
import { SEATS } from '../../src/bonfire/knightPlaces.js';

export const PERIOD = 60 / 126;
// (The scenery's colors land on the page's CSS once a blend ends: palette.js applyCssPalette.)
globalThis.document ??= /** @type {any} */ ({ documentElement: { style: { setProperty() {} } } });
export const seeded =
  (seed = 7) =>
  () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };

/**
 * A stand-in for fire.knights: it keeps who's where and logs what it's asked, tagged with the
 * moment. Like the engine, the first sits on the scenery's seat, and the others sit down
 * where they stand, a step out from the fire (their hips a little further out than their feet).
 */
export function fakeKnights({ max = 4, scenery = 'ruins' } = {}) {
  const seatOf = () => ({ x: SEATS[kn.scenery].x, z: SEATS[kn.scenery].z });
  const ks = Array.from({ length: max }, (_, i) => ({
    index: i,
    present: i === 0,
    state: i === 0 ? 'sitting' : 'away',
    position: { x: SEATS[scenery].x, z: SEATS[scenery].z },
    helmet: 'great',
    move: null,
  }));
  const log = [];
  const kn = {
    max,
    log,
    moment: 'init',
    scenery,
    /** A new scenery (as the scene does it): the first, seated, is on its seat at once. */
    setScenery(name) {
      kn.scenery = name;
      if (ks[0].present && ks[0].state === 'sitting') ks[0].position = seatOf();
    },
    get list() {
      return ks.map((k) => ({ ...k, position: { ...k.position } }));
    },
    get present() {
      return ks.filter((k) => k.present).length;
    },
    slots: (name = kn.scenery) => ({
      center: { x: DANCE_RING.center[0], z: DANCE_RING.center[1] },
      radius: DANCE_RING.radius,
      free: DANCE_RING.free(name),
      slots: danceSlots(name),
    }),
    setCast({ count, helmets }) {
      ks.forEach((k, i) => {
        if (i < count && !k.present) {
          log.push(['in', i, kn.moment]);
          Object.assign(k, { present: true, state: 'sitting' });
        }
        if (i >= count && k.present) {
          log.push(['out', i, kn.moment]);
          Object.assign(k, { present: false, state: 'away' });
        }
        if (i < count && helmets) k.helmet = helmets[i % helmets.length];
      });
    },
    summon(i, o = {}) {
      const k = ks[i];
      // (Gone at once and back somewhere else at once: a leap into place, not a coming and going.)
      const hop = log.findLastIndex((e) => e[0] === 'out' && e[1] === i && e[3] === 'instant');
      if (o.at && o.instant && hop >= 0 && hop === log.length - 1) log.splice(hop, 1);
      else if (!k.present) log.push(['in', i, kn.moment]);
      Object.assign(k, { present: true, state: o.at ? 'standing' : 'sitting', seatedDance: null });
      if (o.at) {
        k.position = { ...o.at };
        log.push(['leap', i, { ...o.at }]);
      } else if (i === 0) k.position = seatOf();
      return true;
    },
    dismiss(i, o = {}) {
      const k = ks[i];
      if (k.present) log.push(['out', i, kn.moment, o.instant ? 'instant' : '']);
      Object.assign(k, { present: false, state: 'away', seatedDance: null });
      return true;
    },
    sit(i) {
      const k = ks[i];
      if (i === 0) k.position = seatOf();
      else if (k.state !== 'sitting') {
        const [cx, cz] = DANCE_RING.center;
        const out = Math.hypot(k.position.x - cx, k.position.z - cz) || 1;
        k.position = {
          x: k.position.x + ((k.position.x - cx) / out) * 0.27,
          z: k.position.z + ((k.position.z - cz) / out) * 0.27,
        };
      }
      Object.assign(k, { state: 'sitting', move: null, seatedDance: null });
      log.push(['sit', i]);
      return true;
    },
    stand(i) {
      ks[i].state = 'standing';
      return true;
    },
    dance(i, o = {}) {
      const k = ks[i];
      if (!k.present) {
        log.push(['in', i, kn.moment]);
        k.present = true;
      }
      // (Like the engine: a dance stays seated, or on his feet, unless told.)
      k.seatedDance = o.seated ?? k.seatedDance ?? false;
      k.state = k.seatedDance ? 'sitting' : 'dancing';
      if (o.move) k.move = o.move;
      if (o.position) k.position = { ...o.position };
      log.push(['dance', i, o, kn.moment]);
      return true;
    },
    gesture(name, o) {
      log.push(['gesture', name, o, kn.moment]);
      return true;
    },
    setHelmet(name, { index = 0 } = {}) {
      ks[index].helmet = name;
      return Promise.resolve(true);
    },
    clock() {},
    react(kind) {
      log.push(['react', kind]);
    },
    setShine(o) {
      log.push(['shine', { ...o }, kn.moment]);
    },
    setReactions(on) {
      log.push(['reactions', on, kn.moment]);
    },
    // (The armor's options, as the engine takes them: one finish for the cast, the edge glow, the seat pose.)
    setFinish(name) {
      kn.finish = name;
      log.push(['finish', name, kn.moment]);
    },
    setRim(v) {
      kn.rim = v;
      log.push(['rim', v, kn.moment]);
    },
    setSeatPose(name) {
      kn.seatPose = name;
      log.push(['seat', name, kn.moment]);
    },
    setStyle(name, o = {}) {
      kn.style = name;
      log.push(['style', name, kn.moment, o.instant ? 'instant' : '']);
      return Promise.resolve(true);
    },
  };
  return kn;
}

export const settingsWith = (over = {}) => ({ ...structuredClone(DEFAULT_SETTINGS), ...over });
export function showFor(over = {}, o = {}) {
  const settings = settingsWith(over);
  const show = createKnightShow(settings, {
    clock: createBarClock(settings, seeded(3)),
    rng: seeded(o.seed ?? 11),
    reducedMotion: !!o.reduced,
  });
  const kn = fakeKnights({ max: o.max ?? 4, scenery: o.scenery ?? 'ruins' });
  show.update(kn, 0.016, { scenery: kn.scenery });
  return { settings, show, kn };
}
/** `bars` bars of music: four beats with frames between, then the next bar's downbeat (bar() `from`, `from` + 1, …). */
export function play(
  show,
  kn,
  bars,
  {
    from = 1,
    intensity = 0.85,
    strength = 0.7,
    groove = true,
    low = false,
    budget = 0.8,
    locked = true,
    scenery = kn.scenery,
  } = {},
) {
  for (let b = 0; b < bars; b++) {
    for (let k = 0; k < 4; k++) {
      show.beat(kn, { strength, groove, low });
      for (let f = 0; f < 4; f++)
        show.update(kn, PERIOD / 4, { beatPos: (from + b - 1) * 4 + k + f / 4, period: PERIOD, scenery });
    }
    show.bar(kn, { bar: from + b, budget, intensity, strength, locked, groove, low });
  }
}
export const dancesOf = (log, from = 0) => log.slice(from).filter((e) => e[0] === 'dance' && !e[2].seated);
export const ins = (log) => log.filter((e) => e[0] === 'in' || e[0] === 'out');

// --- the director (director.js), on a stand-in scene ------------------------------------
/**
 * A stand-in for the scene: the knights are fakeKnights, anything else is logged and does
 * nothing. Its weapon swaps behave like scene.js's: equip() is at once (`instant`), an impact
 * where it stands (the same weapon, nothing forging), or a swap on its way (held for release()
 * with `hold`) that lands when the test says so (land(): returns its flame, for the director's
 * landed()). `impacts` lists what landed.
 */
export function fakeFire(kn) {
  const calls = [];
  const impacts = [];
  const base = {
    drive: {},
    glitch: {},
    scenery: kn.scenery,
    weapon: 'longsword',
    flame: 'ember',
    element: 'fire',
    holding: false,
    forging: false,
    swinging: false,
    knights: kn,
    fireflies: null,
    blade: null,
    swapTime: 3,
    calls,
    impacts,
    swap: null,
    equip(weapon, flame, o = {}) {
      calls.push(['equip', weapon, flame, { ...o }]);
      const to = { weapon, flame, element: o.element ?? base.element };
      if (o.instant || (weapon === base.weapon && !base.forging)) {
        Object.assign(base, to, { forging: false, holding: false, swap: null });
        impacts.push({ ...to, instant: !!o.instant });
        return Promise.resolve({ status: 'applied' });
      }
      if (base.forging) return Promise.resolve({ status: 'cancelled' });
      Object.assign(base, { swap: to, forging: true, holding: !!o.hold });
      return Promise.resolve({ status: 'forging' });
    },
    release() {
      if (!base.holding) return false;
      base.holding = false;
      return true;
    },
    /** The swap on its way lands (its impact): its flame key, or null. */
    land() {
      const to = base.swap;
      if (!to) return null;
      Object.assign(base, to, { forging: false, holding: false, swap: null });
      impacts.push({ ...to });
      return to.flame;
    },
    setScenery(name) {
      if (name === base.scenery) return false;
      base.scenery = name;
      kn.setScenery(name);
      calls.push(['setScenery', name, kn.log.length]);
      return true;
    },
  };
  return new Proxy(base, {
    get: (t, k) =>
      k in t
        ? t[k]
        : (...a) => {
            calls.push([k, ...a]);
            return Promise.resolve(true);
          },
  });
}
export const FRAME = {
  state: 'groove',
  bands: { sub: 0, bass: 0, lowMid: 0, mid: 0, highMid: 0, high: 0 },
  level: 0.5,
  beats: [],
  events: [],
  kick: 0,
  hat: 0,
  bpm: 0,
  locked: false,
  build: 0,
};
export function directorFor(over = {}, { scenes = () => [], reducedMotion = false, paintedLook = false } = {}) {
  const settings = settingsWith(over);
  const kn = fakeKnights({ max: 4, scenery: 'ruins' });
  const fire = fakeFire(kn);
  const shots = [];
  const events = [];
  const director = createDirector(fire, {
    settings,
    scenes,
    reducedMotion,
    paintedLook,
    onEvent: (type, data) => {
      events.push([type, data]);
      if (type === 'shot') shots.push(data.name);
    },
  });
  director.update(FRAME, 0.016); // (the knights come in)
  return { settings, kn, fire, director, shots, events };
}

/**
 * Music for the director: `n` bars of four beats (126 BPM, the tempo locked), counted from
 * bar `from` (the grid's count from the drop), each beat a frame, with a few frames between.
 * `state`: groove | breakdown | build. `first` events go on the first frame (e.g. ['start']).
 */
export function bars(director, n, { from = 1, state = 'groove', strength = 0.7, first = [], level = 0.7 } = {}) {
  const period = PERIOD;
  for (let b = 0; b < n; b++) {
    for (let k = 0; k < 4; k++) {
      const time = performance.now() / 1000;
      const events = b === 0 && k === 0 ? first : [];
      director.update(
        {
          ...FRAME,
          state,
          level,
          events,
          bpm: 60 / period,
          locked: true,
          beats: [{ time, count: (from + b) * 4 + k, beat: k, bar: from + b, strength }],
        },
        0.016,
      );
      for (let f = 0; f < 2; f++) director.update({ ...FRAME, state, level, bpm: 60 / period, locked: true }, 0.016);
    }
  }
}
