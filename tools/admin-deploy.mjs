// Reconcile the current main checkout against its existing Pages CI; API errors fail closed.
// Every main completion is a wake-up, not a changed-file list or a deployable old SHA.
// The workflow calls this before building and again under the same lock immediately before publishing.
export async function deploymentGate({ github, repository, sha }) {
  if (!/^[a-f0-9]{40}$/.test(sha)) throw new Error('Expected a full checkout SHA.');
  const currentHead = async () => (await github.rest.git.getRef({ ...repository, ref: 'heads/main' })).data.object.sha;
  const skip = (reason) => ({ deploy: false, sha, reason });
  if ((await currentHead()) !== sha) return skip('Main advanced; a subsequent completion will reconcile it.');

  // No status filter: an old success must not hide the newest run's failure or active rerun.
  const { data } = await github.rest.actions.listWorkflowRuns({
    ...repository,
    workflow_id: 'deploy.yml',
    branch: 'main',
    event: 'push',
    head_sha: sha,
    per_page: 100,
  });
  const latest = data.workflow_runs.reduce((a, b) => (!a || b.id > a.id ? b : a), null);
  if (!latest) return skip('No existing push CI run for this main SHA.');
  const { data: run } = await github.rest.actions.getWorkflowRun({ ...repository, run_id: latest.id });
  const fullName = `${repository.owner}/${repository.repo}`;
  if (
    run.head_sha !== sha ||
    run.head_branch !== 'main' ||
    run.event !== 'push' ||
    run.path !== '.github/workflows/deploy.yml' ||
    run.repository?.full_name !== fullName ||
    run.head_repository?.full_name !== fullName
  ) {
    return skip('CI provenance does not match this repository, main SHA and Pages workflow.');
  }
  if (run.status !== 'completed' || run.conclusion !== 'success') {
    return skip(`Existing CI run ${run.id} is ${run.status}/${run.conclusion}; nothing deploys.`);
  }
  if ((await currentHead()) !== sha) return skip('Main advanced during verification; nothing deploys.');
  return { deploy: true, sha, runId: run.id, reason: 'Current main passed its existing CI.' };
}
