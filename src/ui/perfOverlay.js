// The stats overlay: how the bonfire's frames are going, the particles in play and what the
// show is doing, in a corner, out of the pointer's way. scene.js (createBonfire) mounts it when
// the page's address has ?perf (the site, Bonfire Live and the Painter alike), or when the page
// turns it on (fire.setStats: Bonfire Live's Stats Overlay setting, the Painter's Tools menu,
// U in both). docs/performance.md says what each number is.
//
// Twice a second it shows (ui/statsGroups.js words it): the frames drawn per second (and the
// cap, if one's set), the time between them (median and 95th percentile, over the last 256),
// the last frame's draw calls and the fire shadow's redraws per second; dimmed under them, the
// frame's parts on average (the page's onTick, which runs on every frame the display shows,
// drawn or not: Bonfire Live's audio analysis, summed since the last drawn frame; the page's
// own onFrame; the scene's update; the draw) and the GPU's shader programs and textures
// (three's renderer.info). Then the particle systems running (the scene's stats()) and the
// page's own part (Bonfire Live's show, the Painter's scene: the director's status()). With
// ?perf each part is also a performance.measure entry, so the browser's profiler shows them on
// its timeline (the setting leaves the profiler alone: a measure is an object a frame).
//
// A frame only writes numbers into fixed arrays; the particles and the page's part are asked
// for, and the text built, twice a second. Its styles go through the style object, not an
// attribute or a style sheet (a page's CSP may refuse those); a page places it with
// --stats-top, --stats-left, --stats-right, --stats-bottom and --stats-z (bottom left by
// default), keeps it to the room it has (--stats-max-h: the rows past it are cut off, and a
// box given no room draws nothing), puts it away for a while (--stats-display: none), and on
// a small screen can shrink it (--stats-font) and fold the dimmed rows away
// (--stats-detail: none). The variables reach it from its parent (createBonfire's
// statsParent: Bonfire Live's page box, where the HUD's height is).
import { statsGroups } from './statsGroups.js';

const RING = 256; // frame intervals kept for the percentiles (about 2 s at 120 fps)
const SHOW_MS = 500;
const PARTS = ['bonfire: page', 'bonfire: update', 'bonfire: draw'];
const TICK = 'bonfire: tick';

// Light on a dark ground, readable over the brightest fire; the headings in a warm gold.
const INK = '#f1ece0';
const LABEL = '#a59d88';
const DIM = '#8b8474';
const HEAD = '#f0c27a';

/**
 * @param {object} o
 * @param {any} o.info                 the renderer's info (three's WebGLRenderer.info)
 * @param {() => number} [o.maxFps]    the frame cap in effect (0: none)
 * @param {() => import('./statsGroups.js').ParticleStats[]} [o.particles]  the scene's particle systems
 * @param {() => { show?: import('./statsGroups.js').ShowStatus | null, painting?: string | null } | null} [o.page]
 *   the page's own part: Bonfire Live's show, the Painter's scene
 * @param {boolean} [o.measures]       performance.measure entries for the profiler (?perf)
 * @param {HTMLElement} [o.parent]
 */
export function createPerfOverlay({
  info,
  maxFps = () => 0,
  particles = () => [],
  page = () => null,
  measures = false,
  parent = document.body,
}) {
  const el = styled('div', {
    position: 'fixed',
    left: 'var(--stats-left, 8px)',
    right: 'var(--stats-right, auto)',
    top: 'var(--stats-top, auto)',
    bottom: 'var(--stats-bottom, 8px)',
    'z-index': 'var(--stats-z, 2147483647)',
    display: 'var(--stats-display, block)',
    'pointer-events': 'none',
    'user-select': 'none',
    'box-sizing': 'border-box',
    'max-width': 'min(380px, calc(100vw - 16px))',
    'max-height': 'var(--stats-max-h, calc(100vh - 16px))',
    overflow: 'hidden',
    font: 'var(--stats-font, 11px)/1.4 ui-monospace, Consolas, monospace',
    'font-variant-numeric': 'tabular-nums',
    color: INK,
    background: 'rgba(7, 7, 11, 0.84)',
    // (Its edge inside, and its padding on what it holds: held to no height, nothing shows.)
    'box-shadow': 'inset 0 0 0 1px rgba(233, 227, 210, 0.14)',
    'text-shadow': '0 1px 0 #000',
    'border-radius': '3px',
  });
  el.className = 'stats-overlay';
  el.setAttribute('aria-hidden', 'true');
  const text = styled('div', { padding: '5px 9px 7px' }, 'Stats…');
  el.append(text);
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
  /** @type {import('./statsGroups.js').StatsGroup[]} */
  let groups = [];

  function show(now) {
    const secs = (now - since) / 1000;
    for (let i = 0; i < count; i++) sorted[i] = intervals[i];
    const s = sorted.subarray(0, count).sort();
    const q = (p) => (count ? s[Math.min(count - 1, Math.floor(p * (count - 1)))] : 0);
    const per = (ms) => (frames ? ms / frames : 0);
    groups = statsGroups({
      frames: {
        fps: frames / secs,
        cap: maxFps(),
        p50: q(0.5),
        p95: q(0.95),
        draws: calls,
        shadows: shadows / secs,
        parts: { tick: ticked ? per(tickMs) : null, page: per(pageMs), update: per(updateMs), draw: per(drawMs) },
        gpu: {
          programs: info.programs?.length ?? null,
          textures: info.memory?.textures ?? null,
          geometries: info.memory?.geometries ?? null,
        },
      },
      particles: particles(),
      ...page(),
    });
    draw(text, groups);
    frames = 0;
    tickMs = 0;
    pageMs = 0;
    updateMs = 0;
    drawMs = 0;
    shadows = 0;
    since = now;
    if (measures) for (const name of [TICK, ...PARTS]) performance.clearMeasures(name);
  }

  return {
    /**
     * The page's onTick ran from `t0` to `t1` (performance.now() ms): on every frame the
     * display shows, drawn or not, so a drawn frame's tick is all of them since the last one.
     */
    tick(t0, t1) {
      ticked = true;
      tickMs += t1 - t0;
      if (measures) performance.measure(TICK, { start: t0, end: t1 });
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
      if (measures) {
        performance.measure(PARTS[0], { start: t0, end: t1 });
        performance.measure(PARTS[1], { start: t1, end: t2 });
        performance.measure(PARTS[2], { start: t2, end: t3 });
      }
      if (t3 - since >= SHOW_MS) show(t3);
    },
    /** What it shows now (ui/statsGroups.js's groups). */
    get groups() {
      return groups;
    },
    dispose() {
      el.remove();
      if (measures) for (const name of [TICK, ...PARTS]) performance.clearMeasures(name);
    },
  };
}

/**
 * An element with these styles (through the style object: see the header) and text.
 * @param {string} tag @param {Record<string, string>} styles @param {string} [text]
 */
function styled(tag, styles, text) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(styles)) node.style.setProperty(k, v);
  if (text !== undefined) node.textContent = text;
  return node;
}

/**
 * The groups as blocks: a heading (and its note), then a row a line, its label in a column.
 * @param {HTMLElement} el @param {import('./statsGroups.js').StatsGroup[]} groups
 */
function draw(el, groups) {
  el.replaceChildren(
    ...groups.map((g, i) => {
      const block = styled('div', { 'margin-top': i ? '6px' : '0' });
      const heading = styled('div', {
        display: 'flex',
        'justify-content': 'space-between',
        gap: '12px',
        color: HEAD,
        'font-weight': '700',
        'font-size': '10px',
        'letter-spacing': '0.08em',
        'text-transform': 'uppercase',
        'border-bottom': '1px solid rgba(240, 194, 122, 0.28)',
        'margin-bottom': '2px',
      });
      heading.append(styled('span', {}, g.title));
      if (g.note)
        heading.append(styled('span', { color: LABEL, 'letter-spacing': '0', 'text-transform': 'none' }, g.note));
      const rows = styled('div', { display: 'grid', 'grid-template-columns': 'max-content 1fr', 'column-gap': '10px' });
      for (const r of g.rows) {
        const small = r.dim ? { color: DIM, 'font-size': '0.9em', display: 'var(--stats-detail, inline)' } : null;
        rows.append(
          styled('span', small ?? { color: LABEL }, r.label),
          styled('span', small ?? { color: INK, 'overflow-wrap': 'anywhere' }, r.value),
        );
      }
      block.append(heading, rows);
      return block;
    }),
  );
}
