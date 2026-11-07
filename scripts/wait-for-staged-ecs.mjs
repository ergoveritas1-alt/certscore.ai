import { execFile } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { setTimeout as sleep } from 'node:timers/promises';
import { stagedAlbObservations } from './lib/staged-ecs-observations.mjs';

const exec = promisify(execFile);
const eventTypes = [
  ['tasksStarted', /has started \d+ tasks?/i],
  ['targetsRegistered', /\bregistered \d+ targets?/i],
  ['tasksDraining', /begun draining connections/i],
  ['tasksStopped', /has stopped \d+ running tasks?/i],
];

export async function waitForStagedEcs(expected, describe, {
  now = () => performance.now(), pause = sleep, timeoutMs = 600_000, intervalMs = 3000, report = console.log, observations,
} = {}) {
  const started = now();
  const waitStartedAt = new Date().toISOString();
  const observed = expected.map(({ name }) => ({ name, firstPrimaryMs: null, allTargetTasksRunningMs: null, oldDeploymentsRemovedMs: null, steadyMs: null }));
  while (now() - started < timeoutMs) {
    const result = await describe();
    const elapsed = now() - started;
    if (elapsed >= timeoutMs) break;
    if (result.failures?.length || result.services?.length !== expected.length) throw new Error('ECS service readback is incomplete.');
    let complete = true;
    for (const [index, { name, task }] of expected.entries()) {
      const service = result.services.find(entry => entry.serviceName === name);
      if (!service || service.status !== 'ACTIVE' || !Number.isInteger(service.desiredCount) || service.desiredCount < 1) {
        throw new Error(`ECS service ${name} is unavailable or has no desired tasks.`);
      }
      const timing = observed[index];
      const target = service.deployments?.find(entry => entry.taskDefinition === task);
      if (target?.rolloutState === 'FAILED') throw new Error(`ECS rollout failed for ${name}.`);
      if (service.taskDefinition !== task || target?.status !== 'PRIMARY') {
        if (timing.firstPrimaryMs !== null || elapsed >= 15_000) throw new Error(`ECS service ${name} switched to an unexpected task definition.`);
        complete = false;
        continue;
      }
      timing.firstPrimaryMs ??= elapsed;
      if (service.deployments.length === 1) timing.oldDeploymentsRemovedMs ??= elapsed;
      void observations?.observe(service, target);
      if (target.runningCount === service.desiredCount) timing.allTargetTasksRunningMs ??= elapsed;
      const steady = target.rolloutState === 'COMPLETED' && service.deployments.length === 1 &&
        target.runningCount === service.desiredCount && service.runningCount === service.desiredCount && service.pendingCount === 0;
      if (!steady) {
        complete = false;
        timing.steadyMs = null;
        continue;
      }
      timing.steadyMs ??= elapsed;
      const deployedAt = Date.parse(target.createdAt);
      const events = service.events ?? [];
      const completion = target.id && events.find(entry => entry.message?.includes(`(deployment ${target.id}) deployment completed`));
      const completedAt = Date.parse(completion?.createdAt);
      timing.deploymentId = target.id ?? null;
      timing.deploymentCreatedAt = target.createdAt ?? null;
      timing.deploymentCompletedAt = completedAt >= deployedAt ? completion.createdAt : null;
      timing.deploymentCompletedMsFromCreation = completedAt >= deployedAt ? completedAt - deployedAt : null;
      timing.latestServiceEventsMsFromDeployment = Object.fromEntries(eventTypes.map(([key, pattern]) => {
        const time = Math.max(...events.filter(entry => pattern.test(entry.message ?? ''))
          .map(entry => Date.parse(entry.createdAt)).filter(value => value >= deployedAt && value <= completedAt));
        return [key, Number.isFinite(time) ? time - deployedAt : null];
      }));
    }
    if (complete) {
      report(JSON.stringify({ waitStartedAt, waitMs: elapsed, services: observed, alb: observations?.summary() }));
      return;
    }
    await pause(Math.min(intervalMs, timeoutMs - elapsed));
  }
  throw new Error('ECS did not stabilize on all expected task definitions before the deadline.');
}

async function main() {
  const [cluster, ...pairs] = process.argv.slice(2);
  if (!cluster || !pairs.length || pairs.length % 2) throw new Error('Expected an ECS cluster and service/task-definition pairs.');
  const expected = [];
  for (let i = 0; i < pairs.length; i += 2) {
    const [name, task] = pairs.slice(i, i + 2);
    if (!name || name.includes('scanner') || !/^arn:aws:ecs:[a-z0-9-]+:[0-9]{12}:task-definition\/[a-zA-Z0-9_-]+:[0-9]+$/.test(task) ||
        expected.some(entry => entry.name === name)) throw new Error('Invalid ECS service or task definition.');
    expected.push({ name, task });
  }
  const controller = new AbortController();
  const observations = process.env.STAGED_ECS_ALB_TIMING === '1' ? stagedAlbObservations(cluster, async args => {
    const { stdout } = await exec('aws', [...args, '--output', 'json'], { timeout: 2500, signal: controller.signal });
    return JSON.parse(stdout);
  }) : undefined;
  try {
    await waitForStagedEcs(expected, async () => {
      const { stdout } = await exec('aws', ['ecs', 'describe-services', '--cluster', cluster, '--services',
        ...expected.map(({ name }) => name), '--output', 'json'], { timeout: 12_000 });
      return JSON.parse(stdout);
    }, { observations });
  } catch (error) {
    if (observations) console.log(JSON.stringify({ alb: observations.summary(), outcome: 'rollout-failed' }));
    throw error;
  } finally {
    controller.abort();
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
