import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';
import { gzipSync } from 'node:zlib';

const exec = promisify(execFile);

test('daily export recovers transient polling and resumes only the original task', async () => {
  const run = mkdtempSync(path.join(tmpdir(), 'audit-delta-recovery-'));
  try {
    const start = '2026-11-06T00:00:00Z';
    const end = '2026-11-08T00:00:00Z';
    const row = {
      scanId: '11111111-1111-4111-8111-111111111111',
      created_at: '2026-11-07T01:00:00Z',
      status: 'completed',
      isMacMini: true,
      cohort_total: 1,
      choice_audit: { version: 'certscore.audit-choice-summary.v2', availability: 'size_bound' },
      caReject: null,
      technicalCounts: null,
      trackingReviews: null,
      policyReceipt: {
        version: 'certscore.audit-policy-provenance.v1',
        binding: {
          scanId: '11111111-1111-4111-8111-111111111111',
          createdAt: '2026-11-07T01:00:00.000Z',
          generation: 'scan-report-projection-v27',
          sourceHash: 'a'.repeat(64),
        },
        bundle: 'b'.repeat(64),
        fetch: 'fetched',
        owner: 'producer_declared_usable',
        text: 'producer_verified_complete_receipt',
      },
    };
    writeFileSync(path.join(run, 'begin.json'), JSON.stringify({
      overlapStartUtc: start, windowEndUtc: end, newScanStartUtc: start,
      includePrivacyFormReceipts: true, pendingRefreshIds: [],
    }));
    const compressed = gzipSync(JSON.stringify(row) + '\n');
    const messages = [
      '__MACMINI_DELTA_IDS_START__',
      createHash('sha256').update(compressed).digest('hex') + '  /tmp/audit-output.gz',
      '__CHUNK_00000001__' + compressed.toString('base64'),
      '__MACMINI_DELTA_IDS_END__',
    ];
    const calls = path.join(run, 'aws-calls.txt');
    const clusterArn = 'arn:aws:ecs:us-west-1:111111111111:cluster/certscore-validation-cluster';
    const taskArn = 'arn:aws:ecs:us-west-1:111111111111:task/certscore-validation-cluster/123';
    const taskDefinitionArn = 'arn:aws:ecs:us-west-1:111111111111:task-definition/certscore-prod-psql-oneoff:1';
    const task = { taskArn, clusterArn, taskDefinitionArn };
    const started = { tasks: [task] };
    const stopped = { tasks: [{ ...task, lastStatus: 'STOPPED', containers: [{ name: 'psql', exitCode: 0 }] }] };
    writeFileSync(path.join(run, 'aws'), `#!${process.execPath}
const fs = require('node:fs');
const args = process.argv.slice(2);
const call = args.slice(0, 2).join(' ');
const file = ${JSON.stringify(calls)};
const previous = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
fs.appendFileSync(file, call + '\\n');
switch (call) {
  case 'ecs run-task':
    if (previous.includes(call) || process.env.AWS_MAX_ATTEMPTS !== '1') process.exit(2);
    console.log(${JSON.stringify(JSON.stringify(started))});
    break;
  case 'ecs describe-tasks':
    if (!args.includes(${JSON.stringify(taskArn)})) process.exit(2);
    if (!previous.includes(call)) {
      console.error('Connection was closed before we received a valid response');
      process.exit(255);
    }
    console.log(${JSON.stringify(JSON.stringify(stopped))});
    break;
  case 'ecs describe-task-definition':
    if (!args.includes(${JSON.stringify(taskDefinitionArn)})) process.exit(2);
    console.log(JSON.stringify({taskDefinition:{containerDefinitions:[{
      name:'psql',logConfiguration:{options:{'awslogs-group':'fixture','awslogs-stream-prefix':'query'}}
    }]}}));
    break;
  case 'logs filter-log-events':
    if (!args.includes('query/psql/123')) process.exit(2);
    console.log(JSON.stringify({events:${JSON.stringify(messages)}.map(message=>({message}))}));
    break;
  default: process.exit(2);
}
`, { mode: 0o700 });
    const env = { ...process.env };
    for (const key of Object.keys(env)) {
      if (key.startsWith('CALIBRATION_DB_ECS_')) delete env[key];
    }
    env.PATH = run + path.delimiter + env.PATH;
    const command = ['--import', 'tsx', 'scripts/export-mac-mini-delta.ts', run];
    await exec(process.execPath, command, { env });
    const inventory = path.join(run, 'delta-inventory.json');
    const first = readFileSync(inventory, 'utf8');
    assert.deepEqual(JSON.parse(first).rows, [row]);
    // In this fixture, simulate an interruption after saving raw task output.
    rmSync(inventory);
    await exec(process.execPath, [...command, '--recover'], { env });
    assert.equal(readFileSync(inventory, 'utf8'), first);
    assert.deepEqual(readFileSync(calls, 'utf8').trim().split('\n'), [
      'ecs run-task', 'ecs describe-tasks', 'ecs describe-tasks', 'ecs describe-task-definition',
      'logs filter-log-events', 'ecs describe-tasks', 'ecs describe-task-definition', 'logs filter-log-events',
    ]);
  } finally {
    rmSync(run, { recursive: true, force: true });
  }
});
