// The stats overlay's text: a snapshot of how the frames are going, the particles in play and,
// in Bonfire Live and the Painter, what the show is doing, as a few short groups of rows the
// overlay (ui/perfOverlay.js) draws in a corner. Pure, so the tests read what it says.
//
//   Frames     the frame rate (and the cap), the time between frames (median, 95th
//              percentile), the draw calls and the shadow's redraws; the frame's parts and
//              the GPU's objects dimmed under them, for when the first three look wrong.
//   Particles  each particle system that's running (live of how many it has), the fireflies
//              lit of all of them, the lightning's bolts; a system with nothing live isn't
//              listed. The total live in the heading.
//   Show       (Bonfire Live; the Painter's is Scene, the scene being painted) the section,
//              the budget, the look and its strength, the layers live now (each marked In the
//              Mix or Always), an x-ray flip, a drop's hits while they fire, the knights, the
//              shot, and the preset scene playing with its loop. From the director's status().
import { MODES } from '../modes.js';

/**
 * @typedef {{ fps: number, cap: number, p50: number, p95: number, draws: number, shadows: number,
 *   parts: { tick: number | null, page: number, update: number, draw: number },
 *   gpu: { programs: number | null, textures: number | null, geometries: number | null } }} FrameStats
 * @typedef {{ name: string, live: number, total: number, unit?: string, cast?: boolean }} ParticleStats
 *   a row of the scene's stats().systems (bonfire/sceneRender.js); `cast`: not particles (the knights)
 * @typedef {{ section: string, sinceDrop: number | null, stage: number, budget: number | null,
 *   look: { names: string[], strength: number, pinned: boolean },
 *   layers: { name: string, mode: string }[], xray: string | null,
 *   dropHits: { names: string[], ago: number } | null,
 *   knights: { present: number, dancing: number, mode: string }, shot: string,
 *   scene: { name: string, mode: string } | null,
 *   loop: { mode: string, locked: boolean, next: string | null, when: string | null } }} ShowStatus
 *   the director's status() (visualizer/director.js)
 * @typedef {{ frames: FrameStats, particles?: ParticleStats[], show?: ShowStatus | null, painting?: string | null }} StatsSnapshot
 *   `painting`: the Painter's scene, by name (its group is the scene being painted)
 * @typedef {{ label: string, value: string, dim?: boolean }} StatsRow
 * @typedef {{ id: string, title: string, note?: string, rows: StatsRow[] }} StatsGroup
 */

/** Seconds a drop's hits stay listed after they're thrown (the longest runs about two). */
export const DROP_HITS_FOR = 3;
/** The bars after a drop that count as the drop (the director's budget is all-out through them). */
const DROP_BARS = 8;
const MODE_NAME = Object.fromEntries(MODES);
const SECTIONS = { silent: 'Silence', groove: 'Groove', breakdown: 'Breakdown', build: 'Build' };
const KNIGHTS_DOING = { dance: 'dancing', ready: 'up', watch: 'watching the blade', rest: 'resting' };
const WHEN = { drop: 'at the drop', beat: 'on the downbeat', phrase: 'with the next swap' };

/** A count with its thousands marked: 3,230. */
const count = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const percent = (x) => `${Math.round(x * 100)}%`;
const row = (label, value, dim = false) => (dim ? { label, value, dim } : { label, value });

/** @param {FrameStats} f @returns {StatsGroup} */
function frames(f) {
  const ms = (x) => x.toFixed(2);
  const p = f.parts;
  const parts = [
    p.tick === null ? null : `tick ${ms(p.tick)}`,
    `page ${ms(p.page)}`,
    `update ${ms(p.update)}`,
    `draw ${ms(p.draw)}`,
  ].filter(Boolean);
  const gpu = (n) => (n === null ? '?' : String(n));
  return {
    id: 'frames',
    title: 'Frames',
    rows: [
      row('Rate', `${Math.round(f.fps)} fps${f.cap ? ` (cap ${f.cap})` : ''}`),
      row('Frame', `${f.p50.toFixed(1)} ms · p95 ${f.p95.toFixed(1)}`),
      row('Draws', `${f.draws} · ${Math.round(f.shadows)} shadows/s`),
      row('Parts', `${parts.join(' · ')} ms`, true),
      row(
        'GPU',
        `${gpu(f.gpu.programs)} programs · ${gpu(f.gpu.textures)} textures · ${gpu(f.gpu.geometries)} geometries`,
        true,
      ),
    ],
  };
}

/** @param {ParticleStats[]} list @returns {StatsGroup | null} */
function particles(list) {
  const running = list.filter((s) => !s.cast && s.live > 0);
  if (!running.length) return null;
  const live = running.filter((s) => !s.unit).reduce((n, s) => n + s.live, 0);
  return {
    id: 'particles',
    title: 'Particles',
    note: `${count(live)} live`,
    rows: running.map((s) =>
      // (The fireflies count lit ones, before the slash; the bolts, segments, after it.)
      row(
        s.name,
        s.unit === 'lit'
          ? `${count(s.live)} lit / ${count(s.total)}`
          : `${count(s.live)} / ${count(s.total)}${s.unit ? ` ${s.unit}` : ''}`,
      ),
    ),
  };
}

/** @param {ShowStatus} s */
function section(s) {
  if (s.section === 'groove' && s.sinceDrop !== null && s.sinceDrop < DROP_BARS)
    return `Drop · bar ${s.sinceDrop + 1} of ${DROP_BARS}`;
  if (s.section === 'build' && s.stage > 0) return `Build · stage ${s.stage} of 4`;
  return SECTIONS[s.section] ?? s.section;
}

/** The layers live, those in by In the Mix, then those Always. @param {ShowStatus['layers']} layers */
function layerList(layers) {
  if (!layers.length) return 'None';
  return ['mix', 'on']
    .map((mode) => {
      const names = layers.filter((l) => l.mode === mode).map((l) => l.name);
      return names.length ? `${names.join(', ')} (${MODE_NAME[mode]})` : '';
    })
    .filter(Boolean)
    .join(' · ');
}

/** @param {ShowStatus['knights']} k */
function knightsDoing(k) {
  if (k.mode === 'dance' && k.dancing < k.present) return `${k.present} · ${k.dancing} dancing`;
  return `${k.present} · ${KNIGHTS_DOING[k.mode] ?? k.mode}`;
}

/** @param {ShowStatus['loop']} l */
function loopLine(l) {
  const parts = [MODE_NAME[l.mode] ?? l.mode];
  if (l.locked) parts.push('solo');
  if (l.when) parts.push(`next: ${l.next ?? 'the free show'}, ${WHEN[l.when] ?? l.when}`);
  return parts.join(' · ');
}

/**
 * @param {ShowStatus} s
 * @param {string | null | undefined} painting
 * @returns {StatsGroup}
 */
function show(s, painting) {
  const inPainter = typeof painting === 'string';
  /** @type {StatsRow[]} */
  const rows = [];
  if (inPainter) rows.push(row('Painting', painting || 'Untitled'));
  rows.push(row('Section', section(s)));
  rows.push(row('Budget', s.budget === null ? 'Off' : percent(s.budget)));
  // (A preset scene's look in Bonfire Live says so; the Painter's is always the scene's.)
  const own = s.look.pinned && !inPainter ? ' (the scene’s)' : '';
  rows.push(row('Look', `${s.look.names.join(' + ')} · ${percent(s.look.strength)}${own}`));
  rows.push(row('Layers', layerList(s.layers)));
  if (s.xray) rows.push(row('X-Ray', s.xray));
  if (s.dropHits?.names.length && s.dropHits.ago < DROP_HITS_FOR)
    rows.push(row('Drop Hits', s.dropHits.names.join(', ')));
  if (s.knights.present > 0) rows.push(row('Knights', knightsDoing(s.knights)));
  rows.push(row('Shot', s.shot));
  if (!inPainter) {
    rows.push(row('Scene', s.scene ? `${s.scene.name} (${s.scene.mode === 'base' ? 'Base' : 'Hold'})` : 'Free show'));
    rows.push(row('Loop', loopLine(s.loop)));
  }
  return { id: 'show', title: inPainter ? 'Scene' : 'Show', rows };
}

/**
 * The overlay's groups, in order: Frames, Particles (if any are running), and the show (the
 * Painter's scene) when the page has one.
 * @param {StatsSnapshot} snap
 * @returns {StatsGroup[]}
 */
export function statsGroups(snap) {
  const out = [frames(snap.frames)];
  const p = particles(snap.particles ?? []);
  if (p) out.push(p);
  if (snap.show) out.push(show(snap.show, snap.painting));
  return out;
}
