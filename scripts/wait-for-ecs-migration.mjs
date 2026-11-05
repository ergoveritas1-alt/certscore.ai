import { execFile } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

const exec = promisify(execFile);

export async function waitForEcsMigration(expected, describe, {
  now = () => performance.now(), pause = sleep, timeoutMs = 600_000, intervalMs = 3000, report = console.log,
} = {}) {
  const started = now();
  while (now() - started < timeoutMs) {
    const result = await describe();
    const elapsed = now() - started;
    if (elapsed >= timeoutMs) break;
    const [task] = result.tasks ?? [];
    const failures = result.failures ?? [];
    const pendingReadback = result.tasks?.length === 0 &&
      failures.every(failure => failure.arn === expected.arn && failure.reason === 'MISSING');
    if (!pendingReadback && (failures.length || result.tasks?.length !== 1 || task?.taskArn !== expected.arn ||
        task.taskDefinitionArn !== expected.definition)) throw new Error('Migration task readback does not match the requested ECS task.');
    if (task?.lastStatus === 'STOPPED') {
      const containers = task.containers?.filter(container => container.name === expected.container) ?? [];
      const exitCode = containers.length === 1 ? containers[0].exitCode : null;
      const { createdAt, pullStartedAt, pullStoppedAt, startedAt, stoppingAt, stoppedAt } = task;
      report(JSON.stringify({ waitMs: elapsed, taskArn: task.taskArn, exitCode, createdAt, pullStartedAt, pullStoppedAt, startedAt, stoppingAt, stoppedAt }));
      if (exitCode !== 0) throw new Error(`Migration container failed with exit code ${exitCode ?? 'unavailable'}.`);
      return;
    }
    await pause(Math.min(intervalMs, timeoutMs - elapsed));
  }
  throw new Error('Migration task did not stop before the deadline.');
}

async function main() {
  const [cluster, arn, definition, container] = process.argv.slice(2);
  if (!cluster || !/^arn:aws:ecs:[a-z0-9-]+:[0-9]{12}:task\/[\w/-]+$/.test(arn ?? '') ||
      !/^arn:aws:ecs:[a-z0-9-]+:[0-9]{12}:task-definition\/[\w-]+:\d+$/.test(definition ?? '') ||
      !/^[\w-]+$/.test(container ?? '')) throw new Error('Expected cluster, migration task ARN, task definition ARN and container name.');
  await waitForEcsMigration({ arn, definition, container }, async () => {
    const { stdout } = await exec('aws', ['ecs', 'describe-tasks', '--cluster', cluster, '--tasks', arn, '--output', 'json'], { timeout: 12_000 });
    return JSON.parse(stdout);
  });
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
