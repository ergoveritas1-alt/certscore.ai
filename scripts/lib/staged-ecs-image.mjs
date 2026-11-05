import { execFile } from 'node:child_process';
import { lstat, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const shaPattern = /^[0-9a-f]{40}$/;
const digestPattern = /^sha256:[0-9a-f]{64}$/;
const workflowPaths = {
  web: ['.github/workflows/web-aws-ecs-deploy.yml', 'Stage public web'],
  validation: ['.github/workflows/validation-aws-deploy.yml', 'Stage validation'],
};

export function assertStageRun(run, { kind, sha, runId, repository, now = Date.now() }) {
  if (!Object.hasOwn(workflowPaths, kind)) throw new Error('Unsupported ECS staging workflow.');
  const [workflowPath, title] = workflowPaths[kind];
  const completed = Date.parse(run?.updated_at ?? '');
  if (!shaPattern.test(sha) || !/^[1-9][0-9]{0,15}$/.test(runId) ||
      String(run?.id) !== runId || !Number.isSafeInteger(run.run_attempt) || run.run_attempt < 1 ||
      run.path !== workflowPath || run.event !== 'workflow_dispatch' ||
      run.repository?.full_name !== repository || run.head_repository?.full_name !== repository ||
      run.head_branch !== 'main' || run.head_sha !== sha || run.display_title !== `${title} ${sha}` ||
      run.status !== 'completed' || run.conclusion !== 'success' ||
      !Number.isFinite(completed) || completed > now || now - completed > 24 * 60 * 60_000) {
    throw new Error(`Expected a recent successful ${kind} staging run on the exact main revision.`);
  }
  return String(run.run_attempt);
}

export function stagedEcsImage(run, receipt, expected) {
  const attempt = assertStageRun(run, expected);
  const { sha, runId, imageRepository } = expected;
  if (!/^[0-9]{12}\.dkr\.ecr\.[a-z0-9-]+\.amazonaws\.com\/[a-z0-9][a-z0-9/._-]+$/.test(imageRepository) ||
      receipt?.version !== 1 || receipt.sha !== sha || receipt.typecheckedSha !== sha ||
      receipt.runId !== runId || receipt.attempt !== attempt ||
      receipt.repository !== imageRepository || !digestPattern.test(receipt.digest)) {
    throw new Error('Staged ECS image receipt does not match its workflow, SHA or ECR repository.');
  }
  return `${imageRepository}@${receipt.digest}`;
}

export async function readStagedEcsReceipt({ kind, sha, runId, repository, imageRepository = '' }) {
  if (!Object.hasOwn(workflowPaths, kind) || !/^[1-9][0-9]{0,15}$/.test(runId) ||
      !/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(repository)) throw new Error('Invalid staged ECS workflow reference.');
  const { stdout } = await exec('gh', ['api', `repos/${repository}/actions/runs/${runId}`], { timeout: 15_000 });
  const workflow = JSON.parse(stdout);
  const expected = { kind, sha, runId, repository };
  const attempt = assertStageRun(workflow, expected);
  const directory = await mkdtemp(path.join(tmpdir(), 'certscore-ecs-stage-'));
  try {
    await exec('gh', ['run', 'download', runId, '--repo', repository, '--name', `staged-${kind}-image-${attempt}`,
      '--dir', directory], { timeout: 20_000 });
    const file = path.join(directory, `staged-${kind}.json`);
    const info = await lstat(file);
    if (!info.isFile() || info.size > 4096) throw new Error('Invalid staged ECS receipt file.');
    const receipt = JSON.parse(await readFile(file, 'utf8'));
    const uri = stagedEcsImage(workflow, receipt, { ...expected, imageRepository: imageRepository || receipt.repository });
    return { uri, binding: `${attempt}:${receipt.digest}`, digest: receipt.digest };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
