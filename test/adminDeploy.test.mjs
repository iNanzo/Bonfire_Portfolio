// Deployment acceptance tests: recover missed changes and never publish an untested or stale SHA.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { deploymentGate } from '../tools/admin-deploy.mjs';

const sha = 'a'.repeat(40);
const next = 'b'.repeat(40);
const repository = { owner: 'iNanzo', repo: 'Bonfire_Portfolio' };
function fixture(overrides = {}) {
  const run = {
    id: 42,
    head_sha: sha,
    head_branch: 'main',
    event: 'push',
    path: '.github/workflows/deploy.yml',
    status: 'completed',
    conclusion: 'success',
    repository: { full_name: 'iNanzo/Bonfire_Portfolio' },
    head_repository: { full_name: 'iNanzo/Bonfire_Portfolio' },
    ...overrides,
  };
  const state = { head: sha, runs: [run], run, calls: [], fetchedRuns: [] };
  const github = {
    rest: {
      git: { getRef: async () => ({ data: { object: { sha: state.head } } }) },
      actions: {
        listWorkflowRuns: async (args) => {
          state.calls.push(args);
          return { data: { workflow_runs: state.runs } };
        },
        getWorkflowRun: async ({ run_id }) => {
          state.fetchedRuns.push(run_id);
          return { data: state.run };
        },
      },
    },
  };
  const check = (checkoutSha = sha) => deploymentGate({ github, repository, sha: checkoutSha });
  return { state, check };
}

test('deploys only the exact current main SHA with successful existing Pages CI', async () => {
  const { state, check } = fixture();
  assert.deepEqual(await check(), { deploy: true, sha, runId: 42, reason: 'Current main passed its existing CI.' });
  assert.equal(state.calls[0].head_sha, sha);
  assert.equal(state.calls[0].workflow_id, 'deploy.yml');
  assert.equal(state.calls[0].event, 'push');
  assert.equal(Object.hasOwn(state.calls[0], 'status'), false);
});

test('failed relevant push followed by an unrelated successful commit recovers the whole current tree', async () => {
  const { state, check } = fixture({ conclusion: 'failure' });
  assert.equal((await check()).deploy, false);
  // The next current checkout contains the earlier admin change as well as a docs/test-only fix.
  state.head = next;
  state.run = { ...state.run, id: 43, head_sha: next, conclusion: 'success' };
  state.runs = [state.run];
  assert.equal((await check()).deploy, false); // The failed older checkout stays ineligible.
  assert.equal((await check(next)).deploy, true);
});

for (const conclusion of ['failure', 'cancelled', 'skipped', 'timed_out', 'neutral', null]) {
  test(`does not deploy when existing CI is ${conclusion}`, async () => {
    assert.equal((await fixture({ conclusion }).check()).deploy, false);
  });
}

test('pending CI and absent CI cannot authorize deployment', async () => {
  assert.equal((await fixture({ status: 'in_progress', conclusion: null }).check()).deploy, false);
  const { state, check } = fixture();
  state.runs = [];
  assert.equal((await check()).deploy, false);
});

for (const override of [
  { event: 'pull_request' },
  { event: 'workflow_dispatch' },
  { head_branch: 'feature' },
  { head_sha: next },
  { path: '.github/workflows/checks.yml' },
  { head_repository: { full_name: 'someone/fork' } },
  { repository: { full_name: 'someone/fork' } },
]) {
  test(`rejects wrong provenance: ${JSON.stringify(override)}`, async () => {
    assert.equal((await fixture(override).check()).deploy, false);
  });
}

test('old checkout is rejected before any CI lookup, including stale manual reruns', async () => {
  const { state, check } = fixture();
  state.head = next;
  assert.equal((await check()).deploy, false);
  assert.equal(state.calls.length, 0);
});

test('a new main commit during the build prevents publication at the second gate', async () => {
  const { state, check } = fixture();
  assert.equal((await check()).deploy, true);
  state.head = next;
  assert.equal((await check()).deploy, false);
});

test('re-fetches run status so an old success cannot mask an active or failed rerun', async () => {
  const { state, check } = fixture();
  state.run = { ...state.run, status: 'in_progress', conclusion: null };
  assert.equal((await check()).deploy, false);
  state.run = { ...state.run, status: 'completed', conclusion: 'failure' };
  assert.equal((await check()).deploy, false);
});

test('the newest run for this SHA controls the gate rather than an older success', async () => {
  const { state, check } = fixture();
  state.run = { ...state.run, id: 43, conclusion: 'failure' };
  state.runs.push(state.run);
  assert.equal((await check()).deploy, false);
  assert.deepEqual(state.fetchedRuns, [43]);
});

test('API failure fails closed', async () => {
  await assert.rejects(
    deploymentGate({
      repository,
      sha,
      github: {
        rest: {
          git: {
            getRef: async () => {
              throw new Error('API unavailable');
            },
          },
        },
      },
    }),
    /API unavailable/,
  );
});

test('a delayed or manually rerun event reconciles the new head, never resurrecting its old SHA', async () => {
  const { state, check } = fixture();
  state.head = next;
  state.run = { ...state.run, id: 43, head_sha: next };
  state.runs = [state.run];
  assert.equal((await check()).deploy, false);
  assert.equal((await check(next)).deploy, true);
});

test('a main update while checking CI is caught by the final ref read', async () => {
  const { state } = fixture();
  let reads = 0;
  const github = {
    rest: {
      git: { getRef: async () => ({ data: { object: { sha: reads++ === 0 ? sha : next } } }) },
      actions: {
        listWorkflowRuns: async () => ({ data: { workflow_runs: [state.run] } }),
        getWorkflowRun: async () => ({ data: state.run }),
      },
    },
  };
  assert.equal((await deploymentGate({ github, repository, sha })).deploy, false);
});

test('only trusted main push completions and main manual dispatches enter the deployment queue', () => {
  const text = readFileSync(new URL('../.github/workflows/deploy-admin.yml', import.meta.url), 'utf8');
  const expression = text.match(/ {4}if: >-\n([\s\S]*?) {4}# Only eligible/)[1];
  const accepts = new Function('github', `return (${expression});`);
  const main = fixture().state.run;
  const context = {
    repository: 'iNanzo/Bonfire_Portfolio',
    ref: 'refs/heads/main',
    event_name: 'workflow_run',
    event: { workflow_run: main },
  };
  assert.equal(accepts(context), true);
  for (const override of [
    { event: 'pull_request' },
    { head_branch: 'feature' },
    { head_repository: { full_name: 'someone/fork' } },
  ])
    assert.equal(accepts({ ...context, event: { workflow_run: { ...main, ...override } } }), false);
  assert.equal(accepts({ ...context, event_name: 'workflow_dispatch' }), true);
  assert.equal(accepts({ ...context, event_name: 'workflow_dispatch', ref: 'refs/heads/feature' }), false);
  // A failed old event may displace a pending success: both must reconcile current
  // main. The SHA/CI gate, not event history, decides whether it may publish.
  assert.equal(accepts({ ...context, event: { workflow_run: { ...main, conclusion: 'failure' } } }), true);
  assert.equal(accepts({ ...context, event: { workflow_run: { ...main, conclusion: 'cancelled' } } }), true);
});

test('workflow reconciles all main completions, including shared dependencies and unrelated recovery pushes', () => {
  const workflow = readFileSync(new URL('../.github/workflows/deploy-admin.yml', import.meta.url), 'utf8');
  // No path list can miss transitive imports (settingsMap, scenes, contentRules, UI, fonts/lockfile).
  assert.match(workflow, /workflow_run:/);
  assert.match(workflow, /workflows: \['Deploy to GitHub Pages'\]/);
  assert.match(workflow, /types: \[completed\]/);
  assert.match(workflow, /branches: \[main\]/);
  assert.doesNotMatch(workflow, /paths:|paths-ignore:|uses: .*ci\.yml/);
  assert.match(workflow, /ref: main/);
  assert.match(workflow, /cancel-in-progress: false/);
  assert.match(workflow, /group: admin-production/);
  assert.match(workflow, /actions: read/);
  assert.doesNotMatch(workflow, /: write|secrets: inherit|pull_request_target:/);
  assert.equal((workflow.match(/deploymentGate\(/g) || []).length, 2);
  assert.match(workflow, /steps\.publish\.outputs\.deploy == 'true'/);
});
