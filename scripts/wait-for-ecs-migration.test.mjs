import assert from 'node:assert/strict';
import test from 'node:test';
import { waitForEcsMigration } from './wait-for-ecs-migration.mjs';

const expected = { arn: 'migration-task', definition: 'web:2', container: 'web' };
const task = (lastStatus, overrides = {}) => ({ taskArn: expected.arn, taskDefinitionArn: expected.definition, lastStatus,
  containers: [{ name: 'sidecar', exitCode: 1 }, { name: 'web', exitCode: 0 }], ...overrides });
function clock() {
  let ms = 0;
  const reports = [];
  return { reports, now: () => ms, pause: async delay => { ms += delay; }, report: line => reports.push(JSON.parse(line)) };
}

test('polls the exact one-off task and verifies the named container on the terminal read', async () => {
  const opts = clock();
  const reads = [{ tasks: [], failures: [{ arn: expected.arn, reason: 'MISSING' }] },
    { tasks: [task('RUNNING')] }, { tasks: [task('STOPPED')] }];
  await waitForEcsMigration(expected, async () => reads.shift(), opts);
  assert.equal(opts.reports[0].waitMs, 6000);
  assert.equal(opts.reports[0].exitCode, 0);
  assert.equal(reads.length, 0);
});

test('migration rejects wrong identity, wrong container, nonzero exit and timeout', async () => {
  for (const fixture of [task('STOPPED', { taskDefinitionArn: 'web:1' }), task('STOPPED', { taskArn: 'unrelated' })]) {
    await assert.rejects(waitForEcsMigration(expected, async () => ({ tasks: [fixture] }), clock()), /readback/);
  }
  for (const containers of [[{ name: 'sidecar', exitCode: 0 }], [{ name: 'web', exitCode: 1 }]]) {
    await assert.rejects(waitForEcsMigration(expected, async () => ({ tasks: [task('STOPPED', { containers })] }), clock()), /failed with exit code/);
  }
  await assert.rejects(waitForEcsMigration(expected, async () => ({ tasks: [task('RUNNING')] }), { ...clock(), timeoutMs: 6000 }), /deadline/);
  await assert.rejects(waitForEcsMigration(expected, async () => ({ tasks: [] }), { ...clock(), timeoutMs: 6000 }), /deadline/);
});
