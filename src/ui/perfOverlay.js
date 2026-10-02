// The ?perf overlay: how the bonfire's frames are going, in a corner, over everything and out
// of the pointer's way. scene.js (createBonfire) mounts it when the page's address has ?perf,
// so it's there on the site, in Bonfire Live and in the Painter alike (docs/performance.md).
//
// Twice a second it shows the frames drawn per second (and the cap, if one's set), the time
// between them (median and 95th percentile, over the last 256), the frame's parts on average
// (the page's onTick, which runs on every frame the display shows, drawn or not: Bonfire
// Live's audio analysis, summed since the last drawn frame; the page's own onFrame; the
// scene's update; the draw), the last frame's draw calls, the fire shadow's redraws per
// second, and the GPU's shader programs and textures (three's renderer.info). Each part is
// also a performance.measure entry, so the browser's profiler shows them on its timeline.
//
// A frame only writes numbers into fixed arrays; the text is built twice a second.

const RING = 256; // frame intervals kept for the percentiles (about 2 s at 120 fps)
const SHOW_MS = 500;
const PARTS = ['bonfire: page', 'bonfire: update', 'bonfire: draw'];
const TICK = 'bonfire: tick';

/**
 * @param {object} o
 * @param {any} o.info                 the renderer's info (three's WebGLRenderer.info)
 * @param {() => number} [o.maxFps]    the frame cap in effect (0: none)
 * @param {HTMLElement} [o.parent]
 */
export function createPerfOverlay({ info, maxFps = () => 0, parent = document.body }) {
  const el = document.createElement('div');
  el.className = 'perf-overlay';
  el.setAttribute('aria-hidden', 'true');
  // (Inline through the style object, not an attribute: a page's CSP may refuse those.)
  const look = {
    position: 'fixed',
    left: '8px',
    bottom: '8px',
    'z-index': '2147483647',
    'pointer-events': 'none',
    font: '11px/1.4 ui-monospace, Consolas, monospace',
    color: '#e9e3d2',
    background: 'rgba(7, 7, 11, 0.8)',
    padding: '6px 8px',
    'border-radius': '3px',
    'white-space': 'pre',
    'font-variant-numeric': 'tabular-nums',
  };
  for (const [k, v] of Object.entries(look)) el.style.setProperty(k, v);
  el.textContent = 'perf…';
  parent.append(el);

  const intervals = new Float64Array(RING);
  const sorted = new Float64Array(RING);
  let count = 0;
  let head = 0;
  let lastStart = -1;
  let ticked = false; // (a page with an onTick: only then is there a tick figure)
  let frames = 0,
    tickMs = 0,
    pageMs = 0,
    updateMs = 0,
    drawMs = 0,
    shadows = 0,
    calls = 0;
  let since = performance.now();

  function show(now) {
    const secs = (now - since) / 1000;
    for (let i = 0; i < count; i++) sorted[i] = intervals[i];
    const s = sorted.subarray(0, count).sort();
    const q = (p) => (count ? s[Math.min(count - 1, Math.floor(p * (count - 1)))] : 0);
    const per = (ms) => (frames ? ms / frames : 0).toFixed(2);
    const cap = maxFps();
    el.textContent = [
      `fps ${(frames / secs).toFixed(0)}${cap ? ` (cap ${cap})` : ''}   frame p50 ${q(0.5).toFixed(1)}  p95 ${q(0.95).toFixed(1)} ms`,
      `${ticked ? `tick ${per(tickMs)}  ` : ''}page ${per(pageMs)}  update ${per(updateMs)}  draw ${per(drawMs)} ms`,
      `draws ${calls}  shadows ${(shadows / secs).toFixed(0)}/s`,
      `programs ${info.programs?.length ?? '?'}  textures ${info.memory?.textures ?? '?'}  geometries ${info.memory?.geometries ?? '?'}`,
    ].join('\n');
    frames = 0;
    tickMs = 0;
    pageMs = 0;
    updateMs = 0;
    drawMs = 0;
    shadows = 0;
    since = now;
    for (const name of [TICK, ...PARTS]) performance.clearMeasures(name);
  }

  return {
    /**
     * The page's onTick ran from `t0` to `t1` (performance.now() ms): on every frame the
     * display shows, drawn or not, so a drawn frame's tick is all of them since the last one.
     */
    tick(t0, t1) {
      ticked = true;
      tickMs += t1 - t0;
      performance.measure(TICK, { start: t0, end: t1 });
    },
    /**
     * A frame was drawn: it began at `t0`, the page's part ended at `t1`, the scene's update
     * at `t2`, the draw at `t3` (performance.now() ms); `shadow`: the shadow was redrawn.
     */
    frame(t0, t1, t2, t3, shadow) {
      if (lastStart >= 0) {
        intervals[head] = t0 - lastStart;
        head = (head + 1) % RING;
        if (count < RING) count++;
      }
      lastStart = t0;
      frames++;
      pageMs += t1 - t0;
      updateMs += t2 - t1;
      drawMs += t3 - t2;
      if (shadow) shadows++;
      calls = info.render?.calls ?? 0;
      performance.measure(PARTS[0], { start: t0, end: t1 });
      performance.measure(PARTS[1], { start: t1, end: t2 });
      performance.measure(PARTS[2], { start: t2, end: t3 });
      if (t3 - since >= SHOW_MS) show(t3);
    },
    dispose() {
      el.remove();
      for (const name of [TICK, ...PARTS]) performance.clearMeasures(name);
    },
  };
}
