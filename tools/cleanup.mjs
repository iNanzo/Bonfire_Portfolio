// Leftover servers and browsers (npm run cleanup): the Vite dev and preview servers, Playwright's
// browsers and node scripts that agents and test runs started and didn't stop. They hold files
// in node_modules (an `npm ci` then fails with EPERM, half done) and keep ports taken. Lists
// them; `--kill` stops them, each with its children. Servers on the ports .claude/launch.json
// names are the person's own and are left alone unless `--all` is given.
//
//   node tools/cleanup.mjs            list what would go
//   node tools/cleanup.mjs --kill     stop them
//   node tools/cleanup.mjs --all      include the launch.json ports
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = new Set(process.argv.slice(2));
const kill = args.has('--kill');
const all = args.has('--all');

/** The ports the person's own servers use (.claude/launch.json), kept unless --all. */
function ownPorts() {
  try {
    const launch = JSON.parse(readFileSync(resolve(root, '.claude/launch.json'), 'utf8'));
    return new Set(launch.configurations.map((c) => c.port).filter(Boolean));
  } catch {
    return new Set();
  }
}

/** Every process whose image is node or a browser, with its command line: [{ pid, name, cmd }]. */
function processes() {
  if (process.platform === 'win32') {
    const ps =
      "Get-CimInstance Win32_Process -Filter \"Name='node.exe' OR Name='chrome.exe' OR Name='chrome-headless-shell.exe'\" | " +
      'Select-Object ProcessId,Name,CommandLine | ConvertTo-Json -Compress';
    const out = execFileSync('powershell', ['-NoProfile', '-Command', ps], {
      encoding: 'utf8',
      maxBuffer: 1 << 26,
    }).trim();
    const list = out ? [JSON.parse(out)].flat() : [];
    return list.map((p) => ({ pid: p.ProcessId, name: p.Name, cmd: p.CommandLine ?? '' }));
  }
  const out = execFileSync('ps', ['-eo', 'pid=,comm=,args='], { encoding: 'utf8' });
  return out
    .split('\n')
    .map((line) => line.trim().match(/^(\d+)\s+(\S+)\s+(.*)$/))
    .filter(Boolean)
    .map(([, pid, name, cmd]) => ({ pid: Number(pid), name: basename(name), cmd }))
    .filter((p) => /node|chrome/.test(p.name));
}

const worktrees = resolve(root, '..', 'bp-wt').replaceAll('\\', '/').toLowerCase();
const own = ownPorts();

/** Why a process is an agent's leftover, or null if it isn't one. */
function leftover({ cmd, pid }) {
  if (pid === process.pid) return null;
  const c = cmd.replaceAll('\\', '/').toLowerCase();
  const port = Number(c.match(/--port[ =](\d{4,5})/)?.[1]);
  if (port && own.has(port) && !all) return null;
  if (c.includes(worktrees)) return 'in an agent worktree (../bp-wt)';
  if (c.includes('/.scratch/')) return 'a scratch script';
  if (c.includes('playwright_chromiumdev_profile') || c.includes('ms-playwright')) return "a test run's browser";
  if (/vite(\.js|\/bin)/.test(c) && port) return `a Vite server on ${port}`;
  return null;
}

const found = processes()
  .map((p) => ({ ...p, why: leftover(p) }))
  .filter((p) => p.why);

if (!found.length) {
  console.log('Nothing left running.');
  process.exit(0);
}
for (const p of found) console.log(`${String(p.pid).padStart(7)}  ${p.name.padEnd(12)} ${p.why}`);
if (!kill) {
  console.log(`\n${found.length} left running. \`node tools/cleanup.mjs --kill\` stops them.`);
  process.exit(0);
}
let stopped = 0;
for (const p of found) {
  try {
    if (process.platform === 'win32')
      execFileSync('taskkill', ['/PID', String(p.pid), '/T', '/F'], { stdio: 'ignore' });
    else process.kill(p.pid, 'SIGTERM');
    stopped++;
  } catch {
    /* gone already, with its parent */
  }
}
console.log(`\nStopped ${stopped} of ${found.length}.`);
