// The coverage report as a Markdown table: the totals against the thresholds in
// .c8rc.json, then each folder, then (folded away) each file. It prints to the terminal, and
// in GitHub Actions it's also written to the run's summary page ($GITHUB_STEP_SUMMARY).
// It reads what `npm run coverage` left behind; the gate itself is c8's check-coverage.
//
//   npm run coverage && node tools/coverage-summary.mjs [coverage/coverage-summary.json]
import fs from 'node:fs';
import path from 'node:path';

const file = process.argv[2] || 'coverage/coverage-summary.json';
if (!fs.existsSync(file)) {
  console.error(`No ${file}: run \`npm run coverage\` first.`);
  process.exit(1);
}
const summary = JSON.parse(fs.readFileSync(file, 'utf8'));
const config = fs.existsSync('.c8rc.json') ? JSON.parse(fs.readFileSync('.c8rc.json', 'utf8')) : {};

const METRICS = ['lines', 'statements', 'branches', 'functions'];
const NAMES = { lines: 'Lines', statements: 'Statements', branches: 'Branches', functions: 'Functions' };

// The same rounding as c8's own table (down, to a hundredth); like c8, a file with nothing
// to cover counts as fully covered.
const pct = ({ covered, total }) => (total ? Math.floor((1000 * 100 * covered) / total / 10) / 100 : 100);
const cell = (m) => `${pct(m).toFixed(2)} %`;
const count = (m) => `${cell(m)} (${m.covered} / ${m.total})`;

// Paths in the summary are absolute (and use the OS's separator); the table shows them
// from the repo root.
const files = Object.entries(summary)
  .filter(([key]) => key !== 'total')
  .map(([abs, m]) => ({ path: path.relative(process.cwd(), abs).split(path.sep).join('/'), m }))
  .sort((a, b) => a.path.localeCompare(b.path));

// A file no test ever imported has no line covered at all (loading a module runs its top
// level). c8's `all` option counts those at 0 %, which is what keeps the total honest.
const unloaded = (m) => m.lines.total > 0 && m.lines.covered === 0;

const folders = new Map();
for (const f of files) {
  const dir = path.posix.dirname(f.path);
  const sum = folders.get(dir) ?? {
    files: 0,
    unloaded: 0,
    ...Object.fromEntries(METRICS.map((k) => [k, { covered: 0, total: 0 }])),
  };
  sum.files += 1;
  if (unloaded(f.m)) sum.unloaded += 1;
  for (const k of METRICS) {
    sum[k].covered += f.m[k].covered;
    sum[k].total += f.m[k].total;
  }
  folders.set(dir, sum);
}

const out = [];
out.push('## Test coverage', '');
out.push(`| | ${METRICS.map((k) => NAMES[k]).join(' | ')} |`, `| --- | ${METRICS.map(() => '---:').join(' | ')} |`);
out.push(`| **All files** | ${METRICS.map((k) => count(summary.total[k])).join(' | ')} |`);
if (METRICS.some((k) => config[k] != null)) {
  out.push(`| Threshold | ${METRICS.map((k) => (config[k] != null ? `${config[k]} %` : '—')).join(' | ')} |`);
}
const never = files.filter((f) => unloaded(f.m));
out.push('', `${files.length} files; ${never.length} of them no test loads (counted at 0 %).`, '');

out.push('### By folder', '');
out.push(
  '| Folder | Lines | Branches | Functions | Files | Not loaded |',
  '| --- | ---: | ---: | ---: | ---: | ---: |',
);
for (const [dir, s] of [...folders].sort(([a], [b]) => a.localeCompare(b))) {
  out.push(
    `| \`${dir}\` | ${cell(s.lines)} | ${cell(s.branches)} | ${cell(s.functions)} | ${s.files} | ${s.unloaded || ''} |`,
  );
}

out.push('', '<details><summary>Every file</summary>', '');
out.push('| File | Lines | Branches | Functions |', '| --- | ---: | ---: | ---: |');
for (const f of files) {
  out.push(`| \`${f.path}\` | ${count(f.m.lines)} | ${cell(f.m.branches)} | ${cell(f.m.functions)} |`);
}
out.push('', '</details>', '');

const markdown = out.join('\n');
process.stdout.write(markdown);
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown);
