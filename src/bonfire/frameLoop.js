// Shared display-rate loop and lazy stats overlay. Clocks remain supplied by each scene.
import { createFrameGate } from './frameGate.js';
export function createFrameLoop({
  renderer,
  scope,
  ctx = { perf: null },
  ready,
  clock = null,
  draw,
  onTick,
  onError,
  pageStats,
  statsParent,
  particles = () => [],
  measureAbsentTick = false,
}) {
  ctx.perf = null;
  const perfAsked = new URLSearchParams(location.search).has('perf');
  let statsWanted = false;
  let statsLoading = false;
  const statsOn = () => (perfAsked || statsWanted) && !scope.disposed;
  function syncStats() {
    if (!statsOn()) {
      ctx.perf?.dispose();
      ctx.perf = null;
      return;
    }
    if (ctx.perf || statsLoading) return;
    statsLoading = true;
    import('../ui/perfOverlay.js').then(
      ({ createPerfOverlay }) => {
        statsLoading = false;
        if (!statsOn() || ctx.perf) return;
        ctx.perf = createPerfOverlay({
          info: renderer.info,
          maxFps: () => gate.maxFps,
          particles,
          page: pageStats,
          measures: perfAsked,
          ...(statsParent ? { parent: statsParent } : {}),
        });
      },
      (error) => {
        statsLoading = false;
        console.warn('The stats overlay did not load.', error);
      },
    );
  }
  scope.cleanup(() => {
    ctx.perf?.dispose();
    ctx.perf = null;
  });

  const gate = createFrameGate();
  let lastTick = -1,
    running = false,
    elapsed = 0;
  const events = new AbortController();
  scope.cleanup(() => {
    events.abort();
    renderer.setAnimationLoop(null);
  });
  function syncRunning() {
    const should = ready() && !scope.disposed && !document.hidden;
    if (should === running) return;
    running = should;
    if (running) {
      clock?.reset();
      lastTick = -1;
      elapsed = 0;
    }
    renderer.setAnimationLoop(
      running
        ? (now) => {
            const tickMs = lastTick < 0 ? 0 : now - lastTick;
            lastTick = now;
            try {
              if (onTick || measureAbsentTick) {
                const t0 = ctx.perf ? performance.now() : 0;
                onTick?.(Math.min(tickMs / 1000, 0.1));
                ctx.perf?.tick(t0, performance.now());
              }
              elapsed += tickMs / 1000;
              if (!gate.due(tickMs)) return;
              if (clock) clock.update();
              draw(Math.min(clock ? clock.getDelta() : elapsed, 0.1));
              elapsed = 0;
            } catch (error) {
              scope.dispose();
              onError?.(error);
            }
          }
        : null,
    );
  }
  document.addEventListener('visibilitychange', syncRunning, { signal: events.signal });
  syncStats();
  return {
    gate,
    syncRunning,
    statsOn,
    get perf() {
      return ctx.perf;
    },
    setStats(on) {
      statsWanted = !!on;
      syncStats();
    },
  };
}

// Register first: the renderer is released after every GPU resource in the scope.
export function ownFrameRenderer(scope, renderer) {
  scope.own({
    dispose() {
      renderer.dispose();
      if (!renderer.getContext().isContextLost()) renderer.forceContextLoss();
    },
  });
  scope.cleanup(() => renderer.setAnimationLoop(null));
}
export function attachFrameCanvas(scope, renderer, container, onError) {
  const canvas = renderer.domElement;
  canvas.className = 'bonfire-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  container.appendChild(canvas);
  scope.cleanup(() => canvas.remove());
  const events = new AbortController();
  scope.cleanup(() => events.abort());
  canvas.addEventListener(
    'webglcontextlost',
    (event) => {
      event.preventDefault();
      scope.dispose();
      onError?.(new Error('WebGL context lost'));
    },
    { signal: events.signal },
  );
  return canvas;
}
export function frameCapture(frame) {
  return {
    capture: frame.capture,
    captureThumb: (w = 192, h = 108) => frame.thumb(w, h),
    onRendered: frame.onRendered,
  };
}
