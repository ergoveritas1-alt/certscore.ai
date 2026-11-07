import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { pathToFileURL } from 'node:url';
import { configureReviewedOptOut } from './configure-reviewed-opt-out.ts';
import { resolveAuditReceipts } from './configure-audit-receipts.ts';
import { installedEcsRevision } from './lib/deployed-image.mjs';
import { waitForStagedEcs } from './wait-for-staged-ecs.mjs';

const receiptKey = 'CERTSCORE_AUDIT_PRIVACY_FORM_PROJECTION_ENABLED';

export async function planVerifiedSettings(aws, { cluster, name, container, region, repository, sha, rollout, receipts }) {
  const state = aws('ecs', 'describe-services', '--cluster', cluster, '--services', name);
  const currentArn = state.services?.[0]?.taskDefinition;
  if (!currentArn) throw new Error(`Missing task definition for ${name}.`);
  const definition = aws('ecs', 'describe-task-definition', '--task-definition', currentArn, '--include', 'TAGS');
  const resolveDigest = revision => aws('ecr', 'describe-images', '--repository-name', repository,
    '--image-ids', `imageTag=${revision}`).imageDetails?.[0]?.imageDigest;
  if (await installedEcsRevision(state, definition, { container, region, repository, resolveDigest }) !== sha) {
    throw new Error(`${name} is not running the requested revision.`);
  }

  const digest = resolveDigest(sha);
  if (!/^sha256:[a-f0-9]{64}$/.test(digest ?? '')) throw new Error(`Missing verified image digest for ${name}.`);
  const { taskArns } = aws('ecs', 'list-tasks', '--cluster', cluster, '--service-name', name, '--desired-status', 'RUNNING');
  if (!Array.isArray(taskArns) || taskArns.length !== state.services[0].desiredCount || taskArns.length > 100) {
    throw new Error(`Incomplete running-task proof for ${name}.`);
  }
  const { tasks, failures } = aws('ecs', 'describe-tasks', '--cluster', cluster, '--tasks', ...taskArns);
  if (failures?.length || tasks?.length !== taskArns.length ||
    new Set(tasks.map(task => task.taskArn)).size !== taskArns.length ||
    tasks.some(task => !taskArns.includes(task.taskArn) || task.taskDefinitionArn !== currentArn ||
      task.lastStatus !== 'RUNNING' || task.containers?.filter(c => c.name === container && c.imageDigest === digest && c.lastStatus === 'RUNNING').length !== 1)) {
    throw new Error(`Running image digest is unverified for ${name}.`);
  }

  const current = definition.taskDefinition;
  const configured = configureReviewedOptOut(structuredClone(current), rollout, container);
  const target = configured.containerDefinitions.find(c => c.name === container);
  if (receipts !== 'preserve') {
    resolveAuditReceipts('preserve', current); // Validate the existing flag and secret binding before replacing it.
    target.environment = [...(target.environment ?? []).filter(e => e.name !== receiptKey),
      { name: receiptKey, value: resolveAuditReceipts(receipts, current) }];
  }
  const original = current.containerDefinitions.find(c => c.name === container);
  const sortedEnv = entries => [...(entries ?? [])].sort((a, b) => a.name.localeCompare(b.name));
  if (isDeepStrictEqual(sortedEnv(original.environment), sortedEnv(target.environment))) return { name, currentArn };

  target.image = `199536052647.dkr.ecr.${region}.amazonaws.com/${repository}@${digest}`;
  target.dockerLabels = { ...target.dockerLabels, 'org.opencontainers.image.revision': sha };
  const input = { ...configured };
  if (definition.tags?.length) input.tags = definition.tags;
  for (const key of ['taskDefinitionArn', 'revision', 'status', 'requiresAttributes', 'compatibilities',
    'registeredAt', 'registeredBy', 'deregisteredAt']) delete input[key];
  return { name, currentArn, input };
}

async function main() {
  const [kind] = process.argv.slice(2);
  const { AWS_REGION: region, ECS_CLUSTER_NAME: cluster, ECS_SERVICE_NAME: name, ECS_CONTAINER_NAME: container,
    ECR_REPOSITORY: repository, GITHUB_SHA: sha, REVIEWED_OPT_OUT_MODE: rollout, AUDIT_RECEIPTS_MODE: receipts,
    ECS_MATERIALIZER_SERVICE_NAME: materializer } = process.env;
  if (!['web', 'validation'].includes(kind) || !cluster || !name || !container || !repository ||
    !/^[a-f0-9]{40}$/.test(sha ?? '') || !['preserve', 'enable', 'disable'].includes(rollout) ||
    !['preserve', 'true', 'false'].includes(receipts) || (rollout === 'preserve' && receipts === 'preserve') ||
    (receipts !== 'preserve' && kind !== 'web') || (kind === 'web' && (!materializer || name === materializer))) {
    throw new Error('Invalid ECS settings-only request.');
  }
  const aws = (...args) => {
    try {
      return JSON.parse(execFileSync('aws', [...args, '--region', region, '--output', 'json'],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));
    } catch {
      throw new Error(`AWS ${args.slice(0, 2).join(' ')} failed. Task definition values omitted.`);
    }
  };
  const services = [];
  if (rollout !== 'preserve') services.push({ name, rollout, receipts: 'preserve' });
  if (kind === 'web') services.push({ name: materializer, rollout, receipts });
  const planService = service => planVerifiedSettings(aws, { cluster, container, region, repository, sha, ...service });
  const plans = await Promise.all(services.map(planService));
  const updates = plans.filter(plan => plan.input);
  if (updates.length) {
    const directory = mkdtempSync(join(tmpdir(), 'certscore-ecs-settings-'));
    try {
      const file = join(directory, 'task-definition.json');
      for (const plan of updates) {
        writeFileSync(file, JSON.stringify(plan.input), { mode: 0o600 });
        plan.task = aws('ecs', 'register-task-definition', '--cli-input-json', `file://${file}`).taskDefinition.taskDefinitionArn;
        if (!plan.task) throw new Error(`Missing registered task definition for ${plan.name}.`);
      }
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }
  for (const { name, task, currentArn } of updates) {
    const state = aws('ecs', 'describe-services', '--cluster', cluster, '--services', name);
    if (state.services?.[0]?.taskDefinition !== currentArn || state.services[0].deployments?.length !== 1 ||
      state.services[0].deployments[0].rolloutState !== 'COMPLETED') throw new Error(`${name} changed during settings preparation.`);
    aws('ecs', 'update-service', '--cluster', cluster, '--service', name, '--task-definition', task);
  }
  if (updates.length) {
    await waitForStagedEcs(updates, () =>
      aws('ecs', 'describe-services', '--cluster', cluster, '--services', ...updates.map(plan => plan.name)));
    const applied = await Promise.all(services.map(planService));
    if (applied.some(plan => plan.input)) throw new Error('ECS settings did not converge.');
  }
  console.log(`Verified settings for ${plans.length} service(s); ${updates.length} required an ECS rollout.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
