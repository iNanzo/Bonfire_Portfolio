// Raises the coverage thresholds in .c8rc.json to what the tests reach now, so coverage can
// only go up: `npm run coverage` fails once it drops under them. It never lowers one; if
// coverage really must drop (code no unit test can load moved in), lower it by hand in the
// same commit and say why.
//
// Each threshold is the measured number less half a point, rounded down to a tenth. Some
// tests take random paths (camera.js alone swings by about 40 lines and 4 functions from
// one run to the next), so a threshold right at the measured number would fail at random.
//
//   npm run coverage && npm run coverage:ratchet [-- --dry-run]
import fs from 'node:fs';

const SUMMARY = 'coverage/coverage-summary.json';
const CONFIG = '.c8rc.json';
const METRICS = ['lines', 'statements', 'functions', 'branches'];
const JITTER = 0.5; // points of run-to-run wobble to allow for

const dryRun = process.argv.includes('--dry-run');
if (!fs.existsSync(SUMMARY)) {
  console.error(`No ${SUMMARY}: run \`npm run coverage\` first.`);
  process.exit(1);
}
const total = JSON.parse(fs.readFileSync(SUMMARY, 'utf8')).total;
let text = fs.readFileSync(CONFIG, 'utf8');
const config = JSON.parse(text);

const changes = [];
let rewrite = false;
for (const k of METRICS) {
  const now = config[k] ?? 0;
  const floor = Math.floor((total[k].pct - JITTER) * 10) / 10;
  if (floor <= now) {
    console.log(`${k.padEnd(10)} ${total[k].pct.toFixed(2)} %  threshold ${now} (kept)`);
    continue;
  }
  changes.push(`${k} ${now} → ${floor}`);
  console.log(`${k.padEnd(10)} ${total[k].pct.toFixed(2)} %  threshold ${now} → ${floor}`);
  config[k] = floor;
  // Edit the number where it stands, so the file keeps its formatting; a threshold the
  // file doesn't have yet means writing it out again.
  const key = new RegExp(`("${k}"\\s*:\\s*)-?[\\d.]+`);
  if (key.test(text)) text = text.replace(key, `$1${floor}`);
  else rewrite = true;
}
if (rewrite) text = `${JSON.stringify(config, null, 2)}\n`;

if (!changes.length) console.log('No threshold to raise.');
else if (dryRun) console.log(`Would raise: ${changes.join(', ')} (dry run; ${CONFIG} unchanged).`);
else {
  JSON.parse(text); // still valid JSON
  fs.writeFileSync(CONFIG, text);
  console.log(`Raised: ${changes.join(', ')}. Commit ${CONFIG} with the tests that earned it.`);
}
