// The type check's debt (tsconfig.json checks every module): a module that doesn't check clean
// yet opts out on its first line, `// @ts-nocheck: N type errors still to fix`. The number of
// them may only go down. Fixing a module means deleting that line and lowering MOST here; a new
// module is written to check clean, never with the line.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const MOST = 45;
const ROOTS = ['src', 'admin'];
const SKIP = new Set(['node_modules', 'dist']);

function modules(dir) {
  return readdirSync(dir).flatMap((name) => {
    if (SKIP.has(name)) return [];
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return modules(path);
    return name.endsWith('.js') ? [path] : [];
  });
}

const all = ROOTS.flatMap((root) =>
  modules(new URL(`../${root}`, import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')),
);
const opted = all.filter((path) => readFileSync(path, 'utf8').includes('@ts-nocheck'));

test(`no more than ${MOST} modules opt out of the type check, each on its first line, saying how many errors it has`, () => {
  assert.ok(all.length > 150, `found the modules (${all.length})`);
  assert.ok(
    opted.length <= MOST,
    `${opted.length} modules opt out of the type check (at most ${MOST}): fix one rather than add one`,
  );
  for (const path of opted) {
    const first = readFileSync(path, 'utf8').split('\n', 1)[0];
    assert.match(
      first,
      /^\/\/ @ts-nocheck: \d+ type errors? still to fix/,
      `${path}: the opt-out is its first line, with its count`,
    );
  }
});
