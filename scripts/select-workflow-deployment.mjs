/** Read-only deployment selection against the actual installed runtime. */
import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { deploymentInputDecision } from './lib/deployment-inputs.mjs';
const [service] = process.argv.slice(2);
const exec = (bin, args) => execFileSync(bin, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 30_000, maxBuffer: 16 * 1024 * 1024 });
const git = args => exec('git', args);
let decision = { service, deploy: true, reasons: [['selection', 'manual dispatch or runtime equivalence unavailable']], ignored: [] };
if (process.env.GITHUB_EVENT_NAME === 'push') {
  try {
    let base;
    if (service === 'web') {
      const response = await fetch(new URL('/api/version', process.env.CERTSCORE_BASE_URL), { cache: 'no-store', signal: AbortSignal.timeout(10_000) });
      if (!response.ok) throw new Error('Live revision unavailable');
      const value = await response.json();
      if (value.runtimeTarget !== 'ecs-fargate') throw new Error('Unexpected runtime');
      base = value.gitSha;
    } else {
      const aws = args => JSON.parse(exec('aws', [...args, '--output', 'json']));
      const observed = aws(['ecs', 'describe-services', '--cluster', process.env.ECS_CLUSTER_NAME, '--services', process.env.ECS_SERVICE_NAME]);
      const active = observed.services?.[0];
      if (observed.failures?.length || !active || active.deployments?.length !== 1 || active.desiredCount < 1 || active.runningCount !== active.desiredCount || active.pendingCount !== 0) throw new Error('Runtime unsettled');
      const definition = aws(['ecs', 'describe-task-definition', '--task-definition', active.taskDefinition]);
      const images = definition.taskDefinition?.containerDefinitions?.filter(value => value.name === process.env.ECS_CONTAINER_NAME);
      if (images?.length !== 1) throw new Error('Unknown runtime container');
      const match = /^199536052647\.dkr\.ecr\.us-west-1\.amazonaws\.com\/certscore-web-mcp:([a-f0-9]{40})$/.exec(images[0].image);
      base = match?.[1];
    }
    if (!/^[a-f0-9]{40}$/.test(base ?? '') || !/^[a-f0-9]{40}$/.test(process.env.GITHUB_SHA ?? '')) throw new Error('Unknown revision');
    git(['cat-file', '-e', `${base}^{commit}`]);
    const files = git(['diff', '--name-only', '--no-renames', '-z', base, process.env.GITHUB_SHA]).split('\0').filter(Boolean);
    decision = await deploymentInputDecision(service, files, file => git(['show', `${base}:${file}`]), file => git(['show', `${process.env.GITHUB_SHA}:${file}`]));
  } catch { /* Never turn missing proof or failed readback into a skipped release. */ }
}
console.log(JSON.stringify(decision, null, 2));
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `deploy=${decision.deploy}\n`);
