// Bonfire Live's benchmark: the show on the demo track in GPU Chrome, scenario by scenario,
// with the numbers that say whether it lags written to test-results/perf/<label>.json
// (tools/bench-compare.mjs puts two runs side by side). docs/performance.md has the how-to.
//
//   node tools/bench-viz.mjs --url http://localhost:5173 [--label mine]
//   node tools/bench-viz.mjs --root ../bp-wt/base --port 5193 --label base   (starts Vite on it)
//   node tools/bench-viz.mjs --root . --port 5183 --prod --label prod        (a build, ?bench)
//
// Options: --scenarios A,B,C,D,E,F,G (default A,B,E,F) · --throttle 4 (CPU slowdown) ·
// --seconds 10 (each measured window) · --rounds 1 · --alloc 4 (seconds of allocation
// sampling after each window; 0: none) · --profile (a CPU profile after each window: busy
// ms/s and the top functions) · --cap 60 (scenario G's frame cap) · --seed 1 · --headed ·
// --out test-results/perf.
//
// Scenarios (each in a fresh browser context, Math.random seeded, preset scenes off so the
// place and the cast stay put):
//   A  the ruins, the free show grooving to the demo
//   B  each of the five places with four knights dancing (a window per place)
//   C  the forge: forge a weapon (A), strike it (Space), the living weapon (X), on a loop
//   D  pixel size 2 with the Painterly layer always on
//   E  six scene rebuilds (the Particles setting toggled): long tasks, and the WebGL
//      programs, textures and contexts still alive after each (they should stay flat)
//   F  the settings: P-menu digits pressed fast with the dialog closed, then a slider dragged
//      in the open dialog
//   G  the frame cap (fire.setMaxFps, where the build has it) at --cap fps
//
// Metrics per window: drawn frames and their intervals (p50/p95/p99/max ms, and the share
// over 16.7 and 33 ms, each with 5% slack for vsync jitter), long tasks, main-thread busy and
// script ms per second (CDP Performance metrics), draw calls per frame (renderer.info, read
// every 30th frame: fire.stats() each frame would cost more than it measures), the fire's
// shadow redraws per second, the JS heap, and (--alloc) the allocation rate. Works on any
// commit in dev mode (window.__viz is there in dev builds); a production build needs ?bench
// in the URL (added here) and a build that honors it.
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';

const SCENERY_NAMES = ['ruins', 'forge', 'shrine', 'cathedral', 'cult'];
const ALL = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];

function parseArgs(argv) {
  const o = { scenarios: 'A,B,E,F', throttle: 1, seconds: 10, rounds: 1, alloc: 0, cap: 60, seed: 1, out: 'test-results/perf', label: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    if (['prod', 'profile', 'headed', 'dev'].includes(key)) { o[key] = true; continue; }
    o[key] = argv[++i];
  }
  for (const k of ['throttle', 'seconds', 'rounds', 'alloc', 'cap', 'seed', 'port']) if (o[k] != null) o[k] = Number(o[k]);
  o.scenarios = String(o.scenarios).toUpperCase().split(',').map((s) => s.trim()).filter((s) => ALL.includes(s));
  return o;
}

const opts = parseArgs(process.argv.slice(2));
if (!opts.url && !opts.root) {
  console.error('Give --url <a running server> or --root <dir> --port <n>. See docs/performance.md.');
  process.exit(2);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --- The server: one that's running (--url), or Vite on --root (dev, or a build and preview).
let server = null;
let baseUrl = opts.url?.replace(/\/+$/, '');
const root = opts.root ? resolve(opts.root) : null;
if (!baseUrl) {
  const port = opts.port || 5183;
  const viteEntry = join(root, 'node_modules', 'vite', 'dist', 'node', 'index.js');
  const vite = await import(pathToFileURL(existsSync(viteEntry) ? viteEntry : join(process.cwd(), 'node_modules', 'vite', 'dist', 'node', 'index.js')).href);
  const configFile = join(root, 'vite.config.js');
  const cacheDir = `node_modules/.vite-${port}`;
  if (opts.prod) {
    const outDir = join(root, 'node_modules', `.bench-dist-${port}`);
    console.log(`Building ${root} into ${outDir}…`);
    await vite.build({ root, configFile, cacheDir, logLevel: 'warn', build: { outDir, emptyOutDir: true } });
    server = await vite.preview({ root, configFile, cacheDir, logLevel: 'warn', build: { outDir }, preview: { port, strictPort: true, host: 'localhost' } });
  } else {
    server = await vite.createServer({ root, configFile, cacheDir, logLevel: 'warn', server: { port, strictPort: true, hmr: false, host: 'localhost' } });
    await server.listen();
  }
  baseUrl = `http://localhost:${port}`;
}
const closeServer = async () => { try { await (server?.close?.() ?? server?.httpServer?.close()); } catch { /* gone */ } };

let sha = null;
try { sha = execFileSync('git', ['-C', root ?? process.cwd(), 'rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim(); } catch { /* not a checkout */ }
const label = opts.label ?? sha ?? 'run';

// --- In the page, before the app's code: a seeded Math.random, long tasks, the WebGL objects
// alive per context (a context that's lost takes its objects with it), and the settings.
function initPage({ seed, settings }) {
  let s = seed >>> 0 || 1;
  Math.random = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  window.__lt = [];
  try {
    new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lt.push({ start: e.startTime, dur: e.duration }); })
      .observe({ type: 'longtask', buffered: true });
  } catch { /* no long tasks here */ }
  const contexts = [];
  window.__gl = {
    created: 0,
    live() {
      const out = { programs: 0, textures: 0, buffers: 0, contexts: 0 };
      for (const c of contexts) {
        if (c.lost) continue;
        out.contexts++;
        out.programs += c.programs;
        out.textures += c.textures;
        out.buffers += c.buffers;
      }
      return out;
    },
  };
  const orig = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
    const ctx = orig.call(this, type, ...rest);
    if (ctx && /webgl/.test(type) && !ctx.__counted) {
      ctx.__counted = true;
      const c = { programs: 0, textures: 0, buffers: 0, lost: false };
      contexts.push(c);
      window.__gl.created++;
      this.addEventListener('webglcontextlost', () => { c.lost = true; });
      const wrap = (name, fn) => { const o = ctx[name].bind(ctx); ctx[name] = (...a) => fn(o, ...a); };
      wrap('createProgram', (o, ...a) => { c.programs++; return o(...a); });
      wrap('deleteProgram', (o, p) => { if (p) c.programs--; return o(p); });
      wrap('createTexture', (o, ...a) => { c.textures++; return o(...a); });
      wrap('deleteTexture', (o, t) => { if (t) c.textures--; return o(t); });
      wrap('createBuffer', (o, ...a) => { c.buffers++; return o(...a); });
      wrap('deleteBuffer', (o, b) => { if (b) c.buffers--; return o(b); });
    }
    return ctx;
  };
  if (settings && location.pathname.includes('/visualizer')) {
    try { localStorage.setItem('bonfire-live', JSON.stringify(settings)); } catch { /* no storage */ }
  }
}

// --- In the page, once the show is up (again after a rebuild): find the renderer (the scene
// hands it over in its next render), count the shadow redraws it does.
async function attachProbe() {
  const fire = window.__viz?.fire;
  const P = (window.__bp ??= { fire: null, renderer: null, shadows: 0 });
  if (!fire) return false;
  if (P.fire === fire && P.renderer) return true;
  P.fire = fire;
  P.renderer = null;
  const scene = fire.debug?.weapons?.holder?.parent;
  if (!scene) return false;
  await new Promise((resolve) => {
    const own = scene.onBeforeRender;
    scene.onBeforeRender = function (renderer, ...rest) {
      P.renderer = renderer;
      scene.onBeforeRender = own;
      resolve();
      return own.call(this, renderer, ...rest);
    };
    setTimeout(resolve, 4000);
  });
  const sm = P.renderer?.shadowMap;
  if (sm && !sm.__bp) {
    const render = sm.render;
    sm.render = function (lights, ...rest) {
      if (this.enabled && (this.autoUpdate || this.needsUpdate) && lights.length) P.shadows++;
      return render.call(this, lights, ...rest);
    };
    sm.__bp = true;
  }
  return !!P.renderer;
}

// --- In the page: one measured window of `ms`.
function sampleWindow(ms) {
  return new Promise((resolve) => {
    const P = window.__bp;
    const fire = P.fire;
    const drawn = [];
    let n = 0, callSum = 0, callN = 0, callMax = 0, triSum = 0;
    const shadows0 = P.shadows;
    const off = fire.onRendered(() => {
      drawn.push(performance.now());
      if (++n % 30 === 0 && P.renderer) {
        const r = P.renderer.info.render;
        callSum += r.calls; callN++; callMax = Math.max(callMax, r.calls); triSum += r.triangles;
      }
    });
    const ticks = [];
    let ticking = true;
    const tick = (t) => { ticks.push(t); if (ticking) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
    const start = performance.now();
    setTimeout(() => {
      off();
      ticking = false;
      const end = performance.now();
      const secs = (end - start) / 1000;
      const iv = [];
      for (let i = 1; i < drawn.length; i++) iv.push(drawn[i] - drawn[i - 1]);
      const sorted = [...iv].sort((a, b) => a - b);
      const q = (p) => (sorted.length ? +sorted[Math.min(sorted.length - 1, Math.floor(p * (sorted.length - 1)))].toFixed(2) : null);
      const over = (msMax) => (iv.length ? +((100 * iv.filter((v) => v > msMax * 1.05).length) / iv.length).toFixed(2) : null);
      const lt = window.__lt.filter((e) => e.start >= start && e.start < end);
      const k = fire.knights;
      resolve({
        seconds: +secs.toFixed(2),
        frames: drawn.length,
        fps: +(drawn.length / secs).toFixed(1),
        displayHz: +(ticks.length / secs).toFixed(1),
        p50: q(0.5), p95: q(0.95), p99: q(0.99), max: q(1),
        over16_7: over(1000 / 60), over33: over(1000 / 30),
        longTasks: { count: lt.length, totalMs: Math.round(lt.reduce((a, e) => a + e.dur, 0)), maxMs: Math.round(lt.reduce((a, e) => Math.max(a, e.dur), 0)) },
        drawCalls: callN ? Math.round(callSum / callN) : null,
        drawCallsMax: callN ? callMax : null,
        triangles: callN ? Math.round(triSum / callN) : null,
        shadowsPerS: +((P.shadows - shadows0) / secs).toFixed(1),
        heapMB: performance.memory ? +(performance.memory.usedJSHeapSize / 1e6).toFixed(1) : null,
        scenery: fire.scenery,
        knights: k?.present ?? null,
        pixelSize: fire.render?.pixelSize ?? null,
      });
    }, ms);
  });
}

async function gpuCounts(page) {
  return page.evaluate(async () => {
    window.gc?.();
    await new Promise((r) => setTimeout(r, 250));
    window.gc?.();
    return { ...window.__gl.live(), contextsCreated: window.__gl.created, heapMB: performance.memory ? +(performance.memory.usedJSHeapSize / 1e6).toFixed(1) : null, canvases: document.querySelectorAll('canvas').length };
  });
}

/** CDP Performance metrics (cumulative seconds): main-thread task and script time. */
async function perfMetrics(cdp) {
  const { metrics } = await cdp.send('Performance.getMetrics');
  const m = Object.fromEntries(metrics.map((x) => [x.name, x.value]));
  return { task: m.TaskDuration ?? 0, script: m.ScriptDuration ?? 0 };
}

/** A measured window: frames, then (optionally) allocation and a CPU profile, each after it. */
async function measure(page, cdp, name, extra = {}) {
  await page.evaluate(attachProbe);
  const before = await perfMetrics(cdp);
  const w = await page.evaluate(sampleWindow, opts.seconds * 1000);
  const after = await perfMetrics(cdp);
  w.busyMsPerS = +(((after.task - before.task) * 1000) / w.seconds).toFixed(1);
  w.scriptMsPerS = +(((after.script - before.script) * 1000) / w.seconds).toFixed(1);
  if (opts.alloc > 0) w.allocMBperS = await allocationRate(cdp, opts.alloc);
  if (opts.profile) Object.assign(w, await cpuProfile(cdp, Math.min(opts.seconds, 8)));
  Object.assign(w, extra);
  console.log(`  ${name.padEnd(14)} ${w.fps} fps  p50 ${w.p50}  p95 ${w.p95}  p99 ${w.p99}  >16.7 ${w.over16_7}%  long ${w.longTasks.count}/${w.longTasks.totalMs}ms  busy ${w.busyMsPerS}  draws ${w.drawCalls}  shadows/s ${w.shadowsPerS}${w.allocMBperS != null ? `  alloc ${w.allocMBperS} MB/s` : ''}`);
  return w;
}

async function allocationRate(cdp, secs) {
  await cdp.send('HeapProfiler.enable');
  await cdp.send('HeapProfiler.startSampling', { samplingInterval: 8192, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true });
  await sleep(secs * 1000);
  const { profile } = await cdp.send('HeapProfiler.stopSampling');
  let total = 0;
  const walk = (node) => { total += node.selfSize; for (const c of node.children) walk(c); };
  walk(profile.head);
  return +(total / 1e6 / secs).toFixed(2);
}

async function cpuProfile(cdp, secs) {
  await cdp.send('Profiler.enable');
  await cdp.send('Profiler.setSamplingInterval', { interval: 250 });
  await cdp.send('Profiler.start');
  await sleep(secs * 1000);
  const { profile } = await cdp.send('Profiler.stop');
  const byId = new Map(profile.nodes.map((n) => [n.id, n]));
  const parent = new Map();
  for (const node of profile.nodes) for (const c of node.children ?? []) parent.set(c, node.id);
  const incl = new Map();
  let busy = 0;
  profile.samples.forEach((id, i) => {
    const d = (profile.timeDeltas[i + 1] ?? profile.timeDeltas[i]) / 1000;
    const top = byId.get(id).callFrame.functionName;
    if (top !== '(idle)' && top !== '(program)') busy += d;
    const seen = new Set();
    for (let cur = id; cur != null; cur = parent.get(cur)) {
      const cf = byId.get(cur).callFrame;
      const key = `${cf.functionName || '(anon)'} ${cf.url.replace(/^.*\/(src|node_modules)\//, '$1/').replace(/\?.*$/, '')}`;
      if (!seen.has(key)) { seen.add(key); incl.set(key, (incl.get(key) ?? 0) + d); }
    }
  });
  const top = [...incl].filter(([k]) => / src\//.test(k)).sort((a, b) => b[1] - a[1]).slice(0, 25).map(([k, v]) => [k, +(v / secs).toFixed(1)]);
  return { profileBusyMsPerS: +(busy / secs).toFixed(1), topFunctions: top };
}

// --- A scenario's page: the settings it starts with, the show up and the demo playing.
const BASE_SETTINGS = { scenes: 'off', scenery: 'ruins' };
async function openShow(browser, settings = {}) {
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  await context.addInitScript(initPage, { seed: opts.seed, settings: { ...BASE_SETTINGS, ...settings } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message.slice(0, 200)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
  const cdp = await context.newCDPSession(page);
  await cdp.send('Performance.enable', { timeDomain: 'threadTicks' }).catch(() => cdp.send('Performance.enable'));
  await page.goto(`${baseUrl}/visualizer/?bench`);
  await page.waitForFunction(() => window.__viz?.fire?.knights, null, { timeout: 120000 });
  await page.evaluate(() => window.__viz.fire.knights.ready);
  await sleep(800);
  await page.click('[data-source="demo"]');
  await sleep(4000);
  if (opts.throttle > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: opts.throttle });
  return { context, page, cdp, errors };
}

const SCENARIOS = {
  async A(browser) {
    const { context, page, cdp, errors } = await openShow(browser);
    const out = { ruins: await measure(page, cdp, 'A ruins') };
    await context.close();
    return { windows: out, errors };
  },
  async B(browser) {
    const { context, page, cdp, errors } = await openShow(browser, { knights: 'on', knightCount: 4, knightDance: 'on' });
    const out = {};
    for (const name of SCENERY_NAMES) {
      await page.evaluate(async (name) => {
        const v = window.__viz;
        v.settings.scenery = name;
        v.fire.setScenery(name);
        const k = v.fire.knights;
        await k.ready;
        k.setCast({ count: 4, instant: true });
        for (let i = 0; i < 4; i++) k.dance(i, { move: 'defaultDance', slot: i, facing: 'front' });
      }, name);
      await sleep(2500);
      out[name] = await measure(page, cdp, `B ${name}`);
    }
    await context.close();
    return { windows: out, errors };
  },
  async C(browser) {
    const { context, page, cdp, errors } = await openShow(browser, { scenery: 'forge' });
    await page.evaluate(() => { window.__viz.fire.setScenery('forge'); });
    await sleep(1000);
    // A, then Space, then X, over and over (forge, strike, the living weapon).
    let looping = true;
    const loop = (async () => {
      while (looping) {
        for (const [key, wait] of [['a', 2500], [' ', 2500], ['x', 4500]]) {
          if (!looping) break;
          await page.keyboard.press(key === ' ' ? 'Space' : key).catch(() => {});
          await sleep(wait);
        }
      }
    })();
    const out = { forge: await measure(page, cdp, 'C forge loop') };
    looping = false;
    await loop;
    await context.close();
    return { windows: out, errors };
  },
  async D(browser) {
    const { context, page, cdp, errors } = await openShow(browser, { pixelSize: 2, pixelShift: 'off', paint: 'on' });
    const out = { paint2: await measure(page, cdp, 'D px2 paint') };
    await context.close();
    return { windows: out, errors };
  },
  async E(browser) {
    const { context, page, cdp, errors } = await openShow(browser);
    await page.evaluate(attachProbe);
    const out = { start: await gpuCounts(page), rebuilds: [] };
    for (let i = 0; i < 6; i++) {
      const t = await page.evaluate(() => { window.__prevFire = window.__viz.fire; return performance.now(); });
      const changed = await page.evaluate(() => {
        const el = document.querySelector('select[data-set="particles"]') ?? document.querySelector('[data-set="particles"]');
        if (!el) return false;
        el.value = el.value === 'normal' ? 'more' : 'normal';
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      });
      if (!changed) { out.error = 'no Particles setting found ([data-set="particles"])'; break; }
      await page.waitForFunction(() => window.__viz.fire !== window.__prevFire, null, { timeout: 60000 });
      await sleep(2500);
      const lt = await page.evaluate((t) => window.__lt.filter((e) => e.start >= t), t);
      out.rebuilds.push({ ...(await gpuCounts(page)), longTasks: lt.length, longMs: Math.round(lt.reduce((a, e) => a + e.dur, 0)), longMax: Math.round(lt.reduce((a, e) => Math.max(a, e.dur), 0)) });
      const r = out.rebuilds.at(-1);
      console.log(`  E rebuild ${i + 1}     programs ${r.programs}  textures ${r.textures}  buffers ${r.buffers}  contexts ${r.contexts} (${r.contextsCreated} made)  heap ${r.heapMB} MB  long ${r.longTasks}/${r.longMs}ms`);
    }
    out.after = await measure(page, cdp, 'E after');
    await context.close();
    return { gpu: { start: out.start, rebuilds: out.rebuilds, error: out.error }, windows: { after: out.after }, errors };
  },
  async F(browser) {
    const { context, page, cdp, errors } = await openShow(browser);
    // P, then the digits as fast as a hand would (palette, few colors, dither, its pattern,
    // outlines, fog), with the settings dialog closed.
    await page.keyboard.press('p');
    let spamming = true;
    const spam = (async () => {
      const keys = ['2', '3', '4', '5', '6', '7'];
      for (let i = 0; spamming; i++) { await page.keyboard.press(keys[i % keys.length]).catch(() => {}); await sleep(110); }
    })();
    const out = { pmenu: await measure(page, cdp, 'F P digits') };
    spamming = false;
    await spam;
    await page.keyboard.press('0'); // (Reset These)
    await page.keyboard.press('p');
    // A slider dragged back and forth in the open dialog.
    await page.keyboard.press('s');
    await sleep(600);
    const box = await page.evaluate(() => {
      const visible = [...document.querySelectorAll('dialog[open] input[type="range"]')].filter((el) => el.offsetParent && el.getBoundingClientRect().width > 40);
      const el = visible[0];
      if (!el) return null;
      el.scrollIntoView({ block: 'center' });
      const r = el.getBoundingClientRect();
      return { x: r.left, y: r.top + r.height / 2, w: r.width, key: el.dataset.set };
    });
    if (box) {
      let dragging = true;
      const drag = (async () => {
        await page.mouse.move(box.x + 4, box.y);
        await page.mouse.down();
        for (let i = 0; dragging; i++) {
          const f = (Math.sin(i / 12) + 1) / 2;
          await page.mouse.move(box.x + 4 + f * (box.w - 8), box.y);
          await sleep(16);
        }
        await page.mouse.up();
      })();
      out.slider = await measure(page, cdp, 'F slider', { slider: box.key });
      dragging = false;
      await drag;
    } else out.slider = { error: 'no range input in the open dialog' };
    await page.keyboard.press('Escape');
    await context.close();
    return { windows: out, errors };
  },
  async G(browser) {
    const { context, page, cdp, errors } = await openShow(browser);
    const has = await page.evaluate((fps) => { const f = window.__viz.fire; if (typeof f.setMaxFps !== 'function') return false; f.setMaxFps(fps); return true; }, opts.cap);
    const out = has ? { [`cap${opts.cap}`]: await measure(page, cdp, `G cap ${opts.cap}`) } : { [`cap${opts.cap}`]: { skipped: 'this build has no fire.setMaxFps' } };
    await context.close();
    return { windows: out, errors };
  },
};

const browser = await chromium.launch({
  channel: 'chrome',
  headless: !opts.headed,
  args: ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-gpu', '--enable-precise-memory-info', '--js-flags=--expose-gc', '--autoplay-policy=no-user-gesture-required'],
});
const result = {
  label, sha, url: baseUrl, mode: opts.prod ? 'prod' : opts.url ? 'url' : 'dev', date: new Date().toISOString(),
  chrome: browser.version(), throttle: opts.throttle, seconds: opts.seconds, seed: opts.seed, viewport: '1920x1080@1',
  rounds: [],
};
try {
  // (A first visit warms Vite's transforms and dependency cache, so no scenario pays for it.)
  {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(`${baseUrl}/visualizer/?bench`);
    await page.waitForFunction(() => window.__viz?.fire?.knights, null, { timeout: 180000 }).catch(() => {});
    await context.close();
  }
  for (let r = 0; r < opts.rounds; r++) {
    console.log(`${label} — round ${r + 1}/${opts.rounds}, CPU ×${opts.throttle}`);
    const round = {};
    for (const id of opts.scenarios) {
      try { round[id] = await SCENARIOS[id](browser); }
      catch (error) { round[id] = { error: String(error?.message ?? error).slice(0, 300) }; console.log(`  ${id} failed: ${round[id].error}`); }
    }
    result.rounds.push(round);
  }
} finally {
  await browser.close();
  await closeServer();
}
mkdirSync(opts.out, { recursive: true });
const file = join(opts.out, `${label}.json`);
writeFileSync(file, JSON.stringify(result, null, 1));
console.log(`Wrote ${file}`);
