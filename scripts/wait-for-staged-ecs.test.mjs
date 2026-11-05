import assert from 'node:assert/strict';
import test from 'node:test';
import { waitForStagedEcs } from './wait-for-staged-ecs.mjs';

const task = 'web:2', name = 'web';
const target = [{ name, task }];
function service(taskDefinition = task, rolloutState = 'COMPLETED', options = {}) {
  return { failures: [], services: [{
    serviceName: name, taskDefinition, status: 'ACTIVE', desiredCount: 1, runningCount: 1, pendingCount: 0,
    deployments: [{ status: 'PRIMARY', taskDefinition, rolloutState, runningCount: 1 }], ...options,
  }] };
}
function clock() {
  let time = 0;
  const output = [];
  return { output, options: { now: () => time, pause: async ms => { time += ms; },
    report: value => output.push(JSON.parse(value)) } };
}

test('staged ECS readiness waits for the exact rollout state and drained prior deployments', async () => {
  const { options, output } = clock();
  const rolling = service(task, 'IN_PROGRESS');
  const old = service();
  old.services[0].deployments.push({ status: 'ACTIVE', taskDefinition: 'web:1' });
  const reads = [service('web:1'), rolling, old, service()];
  await waitForStagedEcs(target, async () => reads.shift(), options);
  assert.equal(output[0].waitMs, 9000);
  assert.equal(output[0].services[0].firstPrimaryMs, 3000);
  assert.equal(output[0].services[0].steadyMs, 9000);
});

test('staged ECS readiness fails closed on rollback, failed deployment, incomplete readback, and timeout', async () => {
  let reads = [service(task, 'IN_PROGRESS'), service('web:1')];
  await assert.rejects(waitForStagedEcs(target, async () => reads.shift(), clock().options), /unexpected task/);
  await assert.rejects(waitForStagedEcs(target, async () => service(task, 'FAILED'), clock().options), /rollout failed/);
  await assert.rejects(waitForStagedEcs(target, async () => ({ services: [] }), clock().options), /incomplete/);
  await assert.rejects(waitForStagedEcs(target, async () => service(task, 'COMPLETED', { pendingCount: 1 }),
    { ...clock().options, timeoutMs: 9000 }), /deadline/);
});

test('rollout event timings exclude autoscaling events after the exact deployment completed', async () => {
  const { options, output } = clock();
  const input = service();
  Object.assign(input.services[0].deployments[0], { id: 'ecs-svc/42', createdAt: '2026-11-05T00:00:00Z' });
  input.services[0].events = [
    { message: 'has begun draining connections', createdAt: '2026-11-05T00:15:00Z' },
    { message: '(service web) (deployment ecs-svc/42) deployment completed.', createdAt: '2026-11-05T00:03:00Z' },
    { message: 'has begun draining connections', createdAt: '2026-11-05T00:02:00Z' },
    { message: 'has deregistered 1 targets', createdAt: '2026-11-05T00:01:50Z' },
    { message: 'has registered 1 targets', createdAt: '2026-11-05T00:01:00Z' },
  ];
  await waitForStagedEcs(target, async () => input, options);
  const timing = output[0].services[0];
  assert.equal(timing.deploymentId, 'ecs-svc/42');
  assert.equal(timing.deploymentCreatedAt, '2026-11-05T00:00:00Z');
  assert.equal(timing.deploymentCompletedAt, '2026-11-05T00:03:00Z');
  assert.equal(timing.deploymentCompletedMsFromCreation, 180_000);
  assert.equal(timing.latestServiceEventsMsFromDeployment.tasksDraining, 120_000);
  assert.equal(timing.latestServiceEventsMsFromDeployment.targetsRegistered, 60_000);
});
