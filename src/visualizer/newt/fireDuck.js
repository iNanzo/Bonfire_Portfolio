// Director protocol without a renderer. W2a replaces the letterless impact clock.
import { createNewtMoments } from './newtMoments.js';
import { createShotFrame, reframeShot, NEWT_SHOTS } from './shots.js';
import { pageOf } from './pages.js';
export function createFireDuck({
  onImpact = (..._args) => {},
  page = 'dusk',
  settings = { page, pageTurns: 'drops' },
  reduced = false,
} = {}) {
  // Copied from src/bonfire/scene.js: drive and idle glitch values.
  const drive = {
    level: 0,
    brightness: 0,
    size: 0,
    height: 0,
    turbulence: 0,
    glow: 0,
    exposure: 0,
    windX: 0,
    windZ: 0,
  };
  const glitch = {
    slice: 0,
    sliceSeed: 0,
    split: 0,
    block: 1,
    wave: 0,
    mirror: 0,
    scan: 0,
    scanMode: 0,
    noise: 0,
    invert: 0,
    feedback: 0,
    zoom: 1,
    feedRot: 0,
    kaleido: 0,
    kaleidoRot: 0,
    rippleR: 0,
    rippleAmp: 0,
    iris: 2,
    letterbox: 0,
    ink: 0,
    cycle: 0,
    temp: 0,
    blackout: 0,
    ghost: 0,
    ghostKeep: 0.9,
    blur: 0,
    glow: 0,
    glowSize: 2,
    glowCut: 0.2,
    grad: 0,
    gradA: 0,
    gradB: 6,
    gradC: 8,
    style: 0,
    styleR: 3,
    styleMix: 1,
    paintAngle: 0,
    paintAspect: 1,
    washEdge: 0,
    flicker: 0,
    flickerMode: 0,
    feedMode: 6,
    ghostMode: 0,
    warpMode: 0,
    warpMix: 1,
    inkMode: 0,
    invertMode: 0,
    scanBlend: 3,
    glowMode: 1,
    gradMode: 0,
  };
  const moments = createNewtMoments({ onImpact, settings, reduced });
  let clock = 0,
    heard = {},
    events = [],
    picture = { letters: [], petals: [], page: null };
  const shotFrame = createShotFrame();
  let shot = null;
  const calls = [];
  const noop = (..._args) => {};
  const duck = {
    calls,
    drive,
    glitch,
    weapon: 'longsword',
    flame: 'ember',
    element: 'fire',
    scenery: 'page',
    alive: true,
    charge: 0,
    holding: false,
    forging: false,
    swinging: false,
    knights: null,
    fireflies: null,
    blade: null,
    shotFrame,
    frameShot(o, key) {
      const anchor = reframeShot(o, key, shotFrame);
      if (anchor) shot = { key, name: NEWT_SHOTS[key].name, anchor };
    },
    swapTime: 1.4,
    canvas: null,
    ready: Promise.resolve(),
    fps: 0,
    maxFps: 0,
    statsShown: false,
    equip(weapon, flame, options = {}) {
      calls.push(['equip', weapon, flame, { ...options }]);
      const selection = {
        weapon,
        flame,
        item: options.item ?? null,
        element: pageOf(moments.page).light ? 'ice' : (options.element ?? duck.element),
      };
      return moments.equip(selection, options);
    },
    release() {
      calls.push(['release']);
      return moments.release();
    },
    step(dt) {
      clock += dt;
      picture = moments.step({ t: clock, f: heard, events });
      heard = {};
      events = [];
      return picture;
    },
    setPage(key) {
      moments.setPage(key);
    },
    get moments() {
      return picture;
    },
    swing: () => Promise.resolve(false),
    pulse: noop,
    ring: noop,
    puff: noop,
    sparkle: noop,
    shake: noop,
    echo: noop,
    refreshScene: noop,
    setScenery: () => false,
    setRender: noop,
    setPalette: noop,
    setFog: noop,
    setShadows: noop,
    setXray: noop,
    setPose: noop,
    setView: noop,
    hear(f) {
      heard = f;
    },
    onEvent(type, data) {
      events.push({ type, data });
    },
    onRendered: () => noop,
    capture: () => Promise.resolve(null),
    captureThumb: () => Promise.resolve(null),
    setMaxFps(fps) {
      duck.maxFps = fps;
    },
    setStats(on) {
      duck.statsShown = !!on;
    },
    snapshot: () => ({
      letter: picture.letters.at(-1) ?? null,
      newt: null,
      page: { name: pageOf(moments.page).name },
      holding: duck.holding,
      fireflies: false,
      shot,
    }),
    dispose() {
      moments.dispose();
    },
  };
  for (const key of ['weapon', 'flame', 'element'])
    Object.defineProperty(duck, key, { get: () => moments.equipment[key] });
  Object.defineProperties(duck, { holding: { get: () => moments.holding }, forging: { get: () => moments.forging } });
  return duck;
}
