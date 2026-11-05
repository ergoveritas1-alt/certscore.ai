const shaPattern = /^[0-9a-f]{40}$/;
const digestPattern = /^sha256:[0-9a-f]{64}$/;
const workflowPath = '.github/workflows/web-aws-ecs-deploy.yml';

export function assertWebStageRun(run, { sha, runId, repository, now = Date.now() }) {
  const completed = Date.parse(run?.updated_at ?? '');
  if (!shaPattern.test(sha) || !/^[1-9][0-9]{0,15}$/.test(runId) ||
      String(run?.id) !== runId || !Number.isSafeInteger(run.run_attempt) || run.run_attempt < 1 ||
      run.path !== workflowPath || run.event !== 'workflow_dispatch' ||
      run.repository?.full_name !== repository || run.head_repository?.full_name !== repository ||
      run.head_branch !== 'main' || run.head_sha !== sha || run.display_title !== `Stage public web ${sha}` ||
      run.status !== 'completed' || run.conclusion !== 'success' ||
      !Number.isFinite(completed) || completed > now || now - completed > 24 * 60 * 60_000) {
    throw new Error('Expected a recent successful web staging run on the exact main revision.');
  }
  return String(run.run_attempt);
}

export function stagedWebImage(run, receipt, expected) {
  const attempt = assertWebStageRun(run, expected);
  const { sha, runId, imageRepository } = expected;
  if (!/^[0-9]{12}\.dkr\.ecr\.[a-z0-9-]+\.amazonaws\.com\/[a-z0-9][a-z0-9/._-]+$/.test(imageRepository) ||
      receipt?.version !== 1 || receipt.sha !== sha || receipt.typecheckedSha !== sha ||
      receipt.runId !== runId || receipt.attempt !== attempt ||
      receipt.repository !== imageRepository || !digestPattern.test(receipt.digest)) {
    throw new Error('Staged web image receipt does not match its workflow, SHA or ECR repository.');
  }
  return `${imageRepository}@${receipt.digest}`;
}
