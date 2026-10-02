// Two benchmark runs side by side (tools/bench-viz.mjs writes them): each scenario's windows,
// metric by metric, before → after, the change, and which way is better.
//
//   node tools/bench-compare.mjs base mine
//   node tools/bench-compare.mjs base-1,base-2 mine-1,mine-2     (several runs: the median)
//   node tools/bench-compare.mjs test-results/perf/base.json path/to/other.json [--dir test-results/perf] [--md]
//
// A side is a label (test-results/perf/<label>.json, or --dir), a path to a .json, or a comma-
// separated list of either; with more than one run or round, each number is their median.
// --md prints a Markdown table instead of plain columns.
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
const flag = (k) => args.includes(`--${k}`);
const opt = (k, d) => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 ? args[i + 1] : d;
};
const dir = opt('dir', 'test-results/perf');
const sides = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--dir');
if (sides.length !== 2) {
  console.error('Usage: node tools/bench-compare.mjs <before> <after> [--dir test-results/perf] [--md]');
  process.exit(2);
}

function load(spec) {
  return spec.split(',').map((s) => {
    const file = existsSync(s) ? s : join(dir, s.endsWith('.json') ? s : `${s}.json`);
    return JSON.parse(readFileSync(file, 'utf8'));
  });
}

// Metric: [label, path in a window, true if higher is better]
const METRICS = [
  ['fps', (w) => w.fps, true],
  ['frame p50 ms', (w) => w.p50, false],
  ['frame p95 ms', (w) => w.p95, false],
  ['frame p99 ms', (w) => w.p99, false],
  ['% > 16.7 ms', (w) => w.over16_7, false],
  ['% > 33 ms', (w) => w.over33, false],
  ['long tasks', (w) => w.longTasks?.count, false],
  ['long task ms', (w) => w.longTasks?.totalMs, false],
  ['busy ms/s', (w) => w.busyMsPerS, false],
  ['script ms/s', (w) => w.scriptMsPerS, false],
  ['busy ms/frame', (w) => (w.busyMsPerS != null && w.fps ? w.busyMsPerS / w.fps : null), false],
  ['draw calls', (w) => w.drawCalls, false],
  ['shadows/s', (w) => w.shadowsPerS, false],
  ['shadows/frame', (w) => (w.shadowsPerS != null && w.fps ? w.shadowsPerS / w.fps : null), false],
  ['alloc MB/s', (w) => w.allocMBperS, false],
  ['profile busy ms/s', (w) => w.profileBusyMsPerS, false],
  ['stepped ms/frame', (w) => w.steppedMsPerFrame, false],
  ['stepped CPU ms/frame', (w) => w.steppedCpuMsPerFrame, false],
  ['shadows/frame (stepped)', (w) => w.shadowsPerFrame, false],
];

const median = (xs) => {
  const v = xs.filter((x) => typeof x === 'number' && Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = v.length >> 1;
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
};

/** Every round of every run on a side: { 'A ruins': [window, …], … } and the E rebuild counts. */
function windowsOf(runs) {
  const out = new Map();
  const gpu = new Map();
  for (const run of runs) {
    for (const round of run.rounds) {
      for (const [id, sc] of Object.entries(round)) {
        for (const [name, w] of Object.entries(sc.windows ?? {})) {
          if (!w || w.skipped || w.error) continue;
          const key = `${id} ${name}`;
          if (!out.has(key)) out.set(key, []);
          out.get(key).push(w);
        }
        if (sc.gpu?.rebuilds?.length) {
          const last = sc.gpu.rebuilds.at(-1);
          const rows = {
            'programs at start': sc.gpu.start?.programs,
            'programs after 6': last.programs,
            'textures at start': sc.gpu.start?.textures,
            'textures after 6': last.textures,
            'contexts alive after 6': last.contexts,
            'heap MB after 6': last.heapMB,
            'rebuild long ms (median)': median(sc.gpu.rebuilds.map((r) => r.longMs)),
          };
          for (const [k, v] of Object.entries(rows)) {
            if (!gpu.has(k)) gpu.set(k, []);
            gpu.get(k).push(v);
          }
        }
      }
    }
  }
  return { windows: out, gpu };
}

const [before, after] = sides.map(load);
const A = windowsOf(before);
const B = windowsOf(after);
const fmt = (v) =>
  v == null ? '—' : Math.abs(v) >= 100 ? v.toFixed(0) : Math.abs(v) >= 10 ? v.toFixed(1) : v.toFixed(2);
function change(a, b, higherBetter) {
  if (a == null || b == null) return ['', ''];
  if (a === b) return ['0%', '='];
  const pct = a === 0 ? (b > 0 ? Infinity : -Infinity) : ((b - a) / Math.abs(a)) * 100;
  const better = higherBetter ? b > a : b < a;
  const small = Math.abs(pct) < 3;
  return [
    `${pct > 0 ? '+' : ''}${Number.isFinite(pct) ? pct.toFixed(1) : pct > 0 ? '+∞' : '−∞'}%`,
    small ? '≈' : better ? 'better' : 'worse',
  ];
}

const rows = [];
const keys = [...new Set([...A.windows.keys(), ...B.windows.keys()])].sort();
for (const key of keys) {
  const wa = A.windows.get(key) ?? [];
  const wb = B.windows.get(key) ?? [];
  for (const [label, get, hi] of METRICS) {
    const a = median(wa.map(get));
    const b = median(wb.map(get));
    if (a == null && b == null) continue;
    rows.push([key, label, fmt(a), fmt(b), ...change(a, b, hi)]);
  }
}
for (const k of [...new Set([...A.gpu.keys(), ...B.gpu.keys()])]) {
  const a = median(A.gpu.get(k) ?? []);
  const b = median(B.gpu.get(k) ?? []);
  rows.push(['E rebuilds', k, fmt(a), fmt(b), ...change(a, b, false)]);
}

const head = ['scenario', 'metric', sides[0], sides[1], 'change', ''];
const meta = (runs) =>
  runs
    .map(
      (r) =>
        `${r.label} (${r.sha ?? '?'}, ${r.mode}, CPU ×${r.throttle}, ${r.rounds.length} round${r.rounds.length === 1 ? '' : 's'})`,
    )
    .join(' + ');
console.log(`before: ${meta(before)}\nafter:  ${meta(after)}\n`);
if (flag('md')) {
  console.log(`| ${head.join(' | ')} |\n|${head.map(() => '---').join('|')}|`);
  for (const r of rows) console.log(`| ${r.join(' | ')} |`);
} else {
  const widths = head.map((h, i) => Math.max(h.length, ...rows.map((r) => String(r[i]).length)));
  const line = (r) =>
    r.map((c, i) => (i >= 2 && i <= 4 ? String(c).padStart(widths[i]) : String(c).padEnd(widths[i]))).join('  ');
  console.log(line(head));
  let last = null;
  for (const r of rows) {
    console.log(line(r[0] === last ? ['', ...r.slice(1)] : r));
    last = r[0];
  }
}
