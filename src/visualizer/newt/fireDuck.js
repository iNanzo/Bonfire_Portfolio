// Director protocol without a renderer. W2a replaces the letterless impact clock.
import { pageOf } from './pages.js';
export function createFireDuck({ onImpact = (..._args) => {}, page = 'dusk' } = {}) {
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
  let pending = null;
  let remaining = 0;
  const calls = [];
  const noop = (..._args) => {};
  function impact(instant = false) {
    if (!pending) return;
    const { selection, resolve, from } = pending;
    pending = null;
    Object.assign(duck, selection, { holding: false, forging: false });
    onImpact(selection.flame, instant ? selection.flame : from, instant, selection);
    resolve({ status: 'applied' });
  }
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
    swapTime: 1.4,
    canvas: null,
    ready: Promise.resolve(),
    fps: 0,
    maxFps: 0,
    statsShown: false,
    equip(weapon, flame, options = {}) {
      calls.push(['equip', weapon, flame, { ...options }]);
      if (pending) {
        pending.resolve({ status: 'cancelled' });
        pending = null;
      }
      const selection = {
        weapon,
        flame,
        item: null,
        element: pageOf(page).light ? 'ice' : (options.element ?? duck.element),
      };
      const instant = !!options.instant || weapon === duck.weapon;
      duck.weapon = weapon;
      duck.element = selection.element;
      duck.holding = !instant && !!options.hold;
      duck.forging = !instant;
      remaining = duck.swapTime / (options.hold ? 1 : (options.pace ?? 1));
      return new Promise((resolve) => {
        pending = { selection, from: duck.flame, resolve };
        if (instant) impact(true);
      });
    },
    release() {
      calls.push(['release']);
      const held = duck.holding;
      duck.holding = false;
      return held;
    },
    step(dt) {
      if (!pending || duck.holding) return;
      remaining -= dt;
      if (remaining <= 0) impact();
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
    setPage(key) {
      page = key;
    },
    setFog: noop,
    setShadows: noop,
    setXray: noop,
    setPose: noop,
    setView: noop,
    hear: noop,
    onEvent: noop,
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
      letter: null,
      newt: null,
      page: { name: pageOf(page).name },
      holding: duck.holding,
      fireflies: false,
      shot: null,
    }),
    dispose() {
      if (pending) pending.resolve({ status: 'cancelled' });
      pending = null;
    },
  };
  return duck;
}
