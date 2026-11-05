import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readStagedEcsReceipt } from './lib/staged-ecs-image.mjs';

const exec = promisify(execFile);
async function aws(args) {
  return (await exec('aws', args, { timeout: 12_000 })).stdout.trim();
}

async function main() {
  const [kind, ecrRepository] = process.argv.slice(2);
  const { GITHUB_REPOSITORY, GITHUB_SHA, STAGED_RUN_ID, STAGED_IMAGE, AWS_REGION } = process.env;
  if (!/^[a-z0-9][a-z0-9/._-]+$/.test(ecrRepository ?? '') || !/^[a-z0-9-]+$/.test(AWS_REGION ?? '') ||
      !/^[1-9][0-9]{0,5}:sha256:[0-9a-f]{64}$/.test(STAGED_IMAGE ?? '')) throw new Error('Invalid staged ECS image inputs.');
  const account = await aws(['sts', 'get-caller-identity', '--query', 'Account', '--output', 'text']);
  const imageRepository = `${account}.dkr.ecr.${AWS_REGION}.amazonaws.com/${ecrRepository}`;
  const [staged, tagged] = await Promise.all([
    readStagedEcsReceipt({ kind, sha: GITHUB_SHA, runId: STAGED_RUN_ID, repository: GITHUB_REPOSITORY, imageRepository }),
    aws(['ecr', 'describe-images', '--repository-name', ecrRepository, '--image-ids', `imageTag=${GITHUB_SHA}`,
      '--query', 'imageDetails[0].imageDigest', '--output', 'text']),
  ]);
  if (staged.binding !== STAGED_IMAGE || staged.digest !== tagged) throw new Error('The approved staged attempt or ECR digest changed.');
  console.log(staged.uri);
}

main().catch(() => {
  console.error('Could not verify the approved staged ECS image.');
  process.exitCode = 1;
});
