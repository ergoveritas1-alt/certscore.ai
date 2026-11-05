import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { getPredeployPlan } from '../predeploy';
import { aggregateShards, digest, directTestFiles, planShards, shardExecutionContext, sharedBootstrapCommand, validateShardPlan, type ShardResult } from './release-shards';
import { workspaceExportsFingerprint } from './release-bootstrap';
import { publishBootstrapArtifact, restoreBootstrapArtifact } from './release-bootstrap-artifact';
import { requiredCiWorkflows, validatePartitionPreparation, validatePreparation, type CiRun } from './release-preparation';
import type { CheckReceipt, ReleaseInputs } from './release-receipts';
import { portableDependencyMetadata } from './release-receipts';
const now = Date.now(), sha = 'a'.repeat(40);
const inputs: ReleaseInputs = { sha, fingerprint: 'source', environment: 'environment', node: 'v22.22.1', pnpm: '10.6.3', clean: true };
const checks = [
  { key: 'workspace-package-build', label: 'setup', command: ['node', 'build.mjs'] },
  { key: 'direct', label: 'direct', command: ['pnpm', 'exec', 'tsx', '--tsconfig', 'a.json', '--test', '--test-concurrency=2', '--test-name-pattern=owned', 'a.test.ts', 'b.test.ts', 'c.test.ts'] },
  { key: 'opaque', label: 'opaque', command: ['pnpm', 'test:all'] },
];
const fixture = (gate = checks) => {
  const plan = planShards(gate, inputs, { workers: 2 });
  const results: ShardResult[] = plan.workers.flatMap((tasks, worker) => [checks[0]!, ...tasks].map(task => ({
    version: 1, planHash: digest(plan), worker, key: task.key, command: task.command, inputs: { ...inputs }, execution: plan.execution, outputsFingerprint: task.key === checks[0]!.key ? 'c'.repeat(64) : undefined,
    startedAt: new Date(now - (task.key === checks[0]!.key ? 3000 : 2000)).toISOString(), completedAt: new Date(now - (task.key === checks[0]!.key ? 2500 : 1000)).toISOString(), durationMs: 500, exitStatus: 0,
  })));
  return { plan, results };
};

test('all 38 canonical parent checks retain exact partition coverage at 1/2/4/6/8 workers', () => {
  const full = getPredeployPlan([], { full: true }).checks;
  assert.equal(full.length, 38);
  for (const workers of [1, 2, 4, 6, 8]) {
    const plan = planShards(full, inputs, { workers });
    assert.equal(plan.checks.length, full.length); validateShardPlan(plan, full);
    assert.equal(plan.workers.length, workers);
    assert.equal(plan.estimates.kind, 'scheduling-model');
  }
});
test('cold eight-worker replay moves the measured commands once without changing inventory', () => {
  const profile = JSON.parse(readFileSync(new URL('../release-verification-timings.json', import.meta.url), 'utf8'));
  const gate = getPredeployPlan([], { full: true }).checks;
  const options = { workers: 8, timings: profile.coldBenchmark.timings, fileTimings: profile.fileTimings };
  const baseline = planShards(gate, inputs, options);
  const candidate = planShards(gate, inputs, { ...options, replayMoves: profile.coldBenchmark.replayMoves });
  for (const { key, from, to } of profile.coldBenchmark.replayMoves) {
    assert.ok(baseline.workers[from]!.some(task => task.key === key));
    assert.ok(candidate.workers[to]!.some(task => task.key === key));
  }
  assert.deepEqual(candidate.workers.flat().map(task => task.key).sort(), baseline.workers.flat().map(task => task.key).sort());
  assert.equal(candidate.checks.length, 38);
});
test('imported bootstrap evidence must bind to the original build worker receipt', () => {
  const gate = [...checks, { key: 'workspace-build', label: 'build', command: ['node', 'workspace.mjs'] }];
  const { plan, results } = fixture(gate);
  const buildWorker = plan.workers.findIndex(tasks => tasks.some(task => task.parent === 'workspace-build'));
  const producer = results.find(result => result.worker === buildWorker && result.key === checks[0]!.key)!;
  const consumer = results.find(result => result.worker !== buildWorker && result.key === checks[0]!.key)!;
  consumer.command = sharedBootstrapCommand;
  consumer.bootstrapSource = { worker: buildWorker, receiptHash: digest(producer) };
  consumer.startedAt = producer.completedAt;
  assert.equal(aggregateShards(plan, gate, results, now).successfulExecutions, results.length);
  consumer.bootstrapSource.receiptHash = 'c'.repeat(64);
  assert.throws(() => aggregateShards(plan, gate, results, now), /Shared bootstrap receipt/);
});

test('bootstrap restore rejects tampered bytes and preserves existing output directories', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'release-bootstrap-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const [producer, consumer, clean, artifact] = ['producer', 'consumer', 'clean', 'artifact'].map(name => path.join(root, name));
  for (const checkout of [producer!, consumer!, clean!]) {
    await mkdir(path.join(checkout, 'node_modules'), { recursive: true });
    await mkdir(path.join(checkout, 'packages', 'example'), { recursive: true });
    await writeFile(path.join(checkout, 'packages', 'example', 'package.json'), '{"main":"./dist/index.js"}');
  }
  const output = path.join(producer!, 'packages', 'example', 'dist');
  await mkdir(output);
  await writeFile(path.join(output, 'index.js'), 'module.exports = 1;');
  const fingerprint = await workspaceExportsFingerprint(producer);
  const receipt = fixture().results[0]!;
  await publishBootstrapArtifact(artifact!, { ...receipt, outputsFingerprint: fingerprint }, producer);
  await restoreBootstrapArtifact(artifact!, fingerprint, consumer);
  assert.equal(await workspaceExportsFingerprint(consumer), fingerprint);
  await assert.rejects(restoreBootstrapArtifact(artifact!, fingerprint, consumer), /clean package output directories/);
  assert.equal(await workspaceExportsFingerprint(consumer), fingerprint);
  await writeFile(path.join(artifact!, 'packages', 'example', 'dist', 'index.js'), 'module.exports = 2;');
  await assert.rejects(restoreBootstrapArtifact(artifact!, fingerprint, clean), /fingerprint mismatch/);
  await assert.rejects(workspaceExportsFingerprint(clean), /ENOENT/);
});
test('scan-core policy keeps all eight fixture files and the package-scoped runner', () => {
  const policy = getPredeployPlan([], { full: true }).checks.find(check => check.key === 'scan-core-policy-full')!;
  const gate = [checks[0]!, policy];
  const plan = planShards(gate, inputs, { workers: 8 });
  for (const [index, [task]] of plan.workers.entries()) {
    assert.ok(task);
    const file = `src/test-shards/policy-surface-scanner-${index}.test.ts`;
    assert.deepEqual(task.files, [file]);
    assert.deepEqual(task.command, ['pnpm', '--filter', '@certscore/scan-core', 'exec', 'node', '--import', 'tsx', '--test', '--test-concurrency=2', file]);
  }
  plan.workers[0]!.length = 0;
  assert.throws(() => validateShardPlan(plan, gate), /Missing\/duplicate files: scan-core-policy-full/);
});
test('parallel workspace typechecks require both complementary filters', () => {
  const typecheck = getPredeployPlan([], { full: true }).checks.find(check => check.key === 'workspace-typecheck')!;
  const gate = [checks[0]!, typecheck];
  assert.deepEqual(planShards(gate, inputs, { workers: 1 }).workers[0]![0]!.command, typecheck.command);
  const plan = planShards(gate, inputs, { workers: 2 });
  const tasks = plan.workers.flat();
  assert.deepEqual(tasks.map(task => task.command.at(-1)).sort(), [
    '--filter=!@website-signal-risk-scanner/web', '--filter=@website-signal-risk-scanner/web',
  ]);
  tasks[0]!.command = tasks[1]!.command;
  assert.throws(() => validateShardPlan(plan, gate), /partition coverage changed: workspace-typecheck/);
});
test('the two Turbo partitions execute each task from the original workspace typecheck exactly once', () => {
  const typecheck = getPredeployPlan([], { full: true }).checks.find(check => check.key === 'workspace-typecheck')!;
  const plan = planShards([checks[0]!, typecheck], inputs, { workers: 2 });
  const inventory = ([bin, ...args]: string[]) => {
    const dryRun = JSON.parse(execFileSync(bin!, [...args, '--dry=json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }));
    return dryRun.tasks.map((task: { taskId: string; command: string }) => [task.taskId, task.command]);
  };
  const original = inventory(typecheck.command);
  const partitioned = plan.workers.flatMap(tasks => tasks.flatMap(task => inventory(task.command)));
  assert.deepEqual(partitioned.sort(), original.sort());
});
test('an unrelated command cannot bind same-worker bootstrap exports', () => {
  const { plan, results } = fixture();
  results.find(result => result.key !== checks[0]!.key)!.reusedPackageExportsFingerprint = 'c'.repeat(64);
  assert.throws(() => aggregateShards(plan, checks, results, now), /reused unverified package exports/);
});
test('workspace typecheck reuse requires the same worker’s bootstrap output', () => {
  const workspace = getPredeployPlan([], { full: true }).checks.find(check => check.key === 'workspace-typecheck')!;
  const gate = [checks[0]!, workspace];
  const { plan, results } = fixture(gate);
  const typecheck = results.find(result => result.key.startsWith('workspace-typecheck:'))!;
  typecheck.reusedPackageExportsFingerprint = 'c'.repeat(64);
  assert.equal(aggregateShards(plan, gate, results, now).successfulExecutions, results.length);
  typecheck.reusedPackageExportsFingerprint = 'd'.repeat(64);
  assert.throws(() => aggregateShards(plan, gate, results, now), /reused unverified package exports/);
});
test('splitting retains every option and opaque commands retain their exact execution', () => {
  const { plan } = fixture();
  const direct = plan.workers.flat().filter(task => task.parent === 'direct');
  assert.deepEqual(direct.flatMap(task => task.files).sort(), ['a.test.ts', 'b.test.ts', 'c.test.ts']);
  assert.ok(direct.every(task => task.command.includes('--test-concurrency=2') && task.command.includes('--test-name-pattern=owned')));
  assert.deepEqual(plan.workers.flat().find(task => task.parent === 'opaque')?.command, checks[2]!.command);
});
test('globs, shell commands, package aliases, traversal and duplicate file lists remain opaque', () => {
  for (const command of [['pnpm', 'test:all'], ['node', '--test', '*.test.ts'], ['pnpm', 'exec', 'tsx', '--test', '../a.test.ts'], ['pnpm', 'exec', 'tsx', '--test', 'a.test.ts', 'a.test.ts'], ['pnpm', 'exec', 'tsx', '--test', 'a.test.ts', '&&', 'true']]) assert.equal(directTestFiles(command), null);
});
test('planner rejects invalid worker counts and timing profiles', () => {
  for (const workers of [0, -1, 1.5, 9]) assert.throws(() => planShards(checks, inputs, { workers }));
  assert.throws(() => planShards(checks, inputs, { workers: 2, timings: { direct: NaN } }));
  assert.throws(() => planShards(checks, inputs, { workers: 2, fileTimings: { 'direct:a.test.ts': -1 } }));
});
test('unknown or changed parent inventory cannot be accepted', () => {
  const { plan } = fixture();
  assert.throws(() => validateShardPlan(plan, checks.slice(1)));
  plan.workers[0]!.push({ key: 'unknown', parent: 'unknown', command: ['true'], files: [], estimatedMs: 1 });
  assert.throws(() => validateShardPlan(plan, checks));
});
test('missing files, duplicate files and changed filters/configuration block aggregation', () => {
  for (const mutation of ['missing', 'duplicate', 'configuration']) {
    const { plan } = fixture(), task = plan.workers.flat().find(task => task.parent === 'direct')!;
    if (mutation === 'missing') task.files.pop();
    if (mutation === 'duplicate') task.files.push(task.files[0]!);
    if (mutation === 'configuration') task.command[4] = 'different.json';
    assert.throws(() => validateShardPlan(plan, checks));
  }
});
test('complete successful partition coverage is a distinct proof, never a fabricated whole-command receipt', () => {
  const { plan, results } = fixture(), proof = aggregateShards(plan, checks, results, now);
  assert.equal(proof.kind, 'partitioned-verification'); assert.equal(proof.parentChecks.length, 3);
  assert.ok(!('command' in proof)); assert.ok(!('exitStatus' in proof));
});
for (const fault of ['missing', 'duplicate', 'failed', 'stale', 'future', 'dirty', 'sha', 'source', 'environment', 'toolchain', 'command', 'plan', 'execution', 'dependency', 'exports'] as const) {
  test(`aggregation rejects ${fault} shard evidence`, () => {
    const { plan, results } = fixture(), row = results.find(result => result.key !== 'workspace-package-build')!;
    if (fault === 'missing') results.pop();
    if (fault === 'duplicate') results[results.length - 1] = results[0]!;
    if (fault === 'failed') row.exitStatus = 1;
    if (fault === 'stale') row.completedAt = new Date(now - 25 * 3600_000).toISOString();
    if (fault === 'future') row.completedAt = new Date(now + 1000).toISOString();
    if (fault === 'dirty') row.inputs.clean = false;
    if (fault === 'sha') row.inputs.sha = 'b'.repeat(40);
    if (fault === 'source') row.inputs.fingerprint = 'other';
    if (fault === 'environment') row.inputs.environment = 'other';
    if (fault === 'toolchain') row.inputs.node = 'v24.0.0';
    if (fault === 'command') row.command = ['true'];
    if (fault === 'plan') row.planHash = 'other';
    if (fault === 'execution') row.execution = { ...row.execution, environment: 'different' };
    if (fault === 'dependency') row.startedAt = new Date(now - 4000).toISOString();
    if (fault === 'exports') results.find(value => value.key === 'workspace-package-build')!.outputsFingerprint = undefined;
    assert.throws(() => aggregateShards(plan, checks, results, now));
  });
}
test('execution context normalizes workspace/transport metadata and binds real configuration', () => {
  const base: NodeJS.ProcessEnv = { NODE_ENV: 'test', TSX_TSCONFIG_PATH: '/one/tsconfig.json', NODE_OPTIONS: '--max-old-space-size=8192', RUNNER_NAME: 'first' };
  assert.deepEqual(shardExecutionContext(base, '/one'), shardExecutionContext({ ...base, TSX_TSCONFIG_PATH: '/two/tsconfig.json', RUNNER_NAME: 'second' }, '/two'));
  assert.notDeepEqual(shardExecutionContext(base, '/one'), shardExecutionContext({ ...base, NODE_OPTIONS: '--max-old-space-size=4096' }, '/one'));
  assert.notDeepEqual(shardExecutionContext(base, '/one'), shardExecutionContext({ ...base, PRIVACY_FLAG: '1' }, '/one'));
});
test('portable dependency metadata normalizes install bookkeeping while binding dependency versions', () => {
  const one = 'prunedAt: today\nstoreDir: /one/store\nvirtualStoreDir: /one/node_modules/.pnpm\nnode: 22\npackage: 1.0.0';
  const two = 'prunedAt: tomorrow\nstoreDir: /other/store\nvirtualStoreDir: /two/node_modules/.pnpm\nnode: 22\npackage: 1.0.0';
  assert.equal(portableDependencyMetadata(one, '/one'), portableDependencyMetadata(two, '/two'));
  assert.notEqual(portableDependencyMetadata(one, '/one'), portableDependencyMetadata(two.replace('1.0.0', '2.0.0'), '/two'));
});

const preparationFixture = () => {
  const receipts: CheckReceipt[] = checks.map(check => ({ version: 1, key: check.key, command: check.command, cwd: '.', inputs: { ...inputs }, outputsFingerprint: 'exports', startedAt: new Date(now - 3000).toISOString(), completedAt: new Date(now - 2000).toISOString(), durationMs: 1000, exitStatus: 0 }));
  const runs: CiRun[] = requiredCiWorkflows.map((workflow, index) => ({ id: index + 1, path: workflow, head_sha: sha, event: 'pull_request', status: 'completed', conclusion: 'success', updated_at: new Date(now - 1000).toISOString(), run_attempt: 1, head_repository: { full_name: 'ergoveritas1-alt/certscore.ai' }, html_url: `https://github.com/ergoveritas1-alt/certscore.ai/actions/runs/${index + 1}` }));
  return { receipts, runs };
};
test('preparation requires all exact local checks plus all six live CI successes', () => {
  const { receipts, runs } = preparationFixture(), proof = validatePreparation(checks, inputs, receipts, 'exports', runs, now);
  assert.equal(proof.ci.length, 6); assert.equal(proof.checks.length, 3);
  assert.throws(() => validatePreparation(checks, inputs, receipts.slice(1), 'exports', runs, now));
  assert.throws(() => validatePreparation(checks, inputs, receipts, 'changed exports', runs, now));
  assert.throws(() => validatePreparation(checks, inputs, receipts, 'exports', runs.slice(1), now));
  assert.throws(() => validatePreparation(checks, { ...inputs, clean: false }, receipts, 'exports', runs, now));
});
test('partition preparation rechecks complete attempts, actual exports, toolchain and live required CI', () => {
  const { plan, results } = fixture(), { runs } = preparationFixture();
  const verify = (rows = results, exports = 'c'.repeat(64), current = inputs, ci = runs) => validatePartitionPreparation(checks, current, plan.execution, plan, rows, exports, ci, now);
  assert.equal(verify().verification, 'partitioned-verification');
  assert.throws(() => verify(results.slice(1)));
  assert.throws(() => verify(results, 'changed'));
  assert.throws(() => verify(results, undefined, { ...inputs, pnpm: '11.0.0' }));
  assert.throws(() => verify(results, undefined, { ...inputs, sha: 'b'.repeat(40) }));
  assert.throws(() => verify(results, undefined, inputs, runs.slice(1)));
});
for (const fault of ['new-failure', 'pending', 'rerun', 'wrong-sha', 'fork', 'stale', 'skipped'] as const) test(`preparation blocks ${fault} CI`, () => {
  const { receipts, runs } = preparationFixture(), bad = { ...runs[0]!, id: 100 };
  if (fault === 'new-failure') bad.conclusion = 'failure';
  if (fault === 'pending') bad.status = 'in_progress';
  if (fault === 'rerun') { bad.id = runs[0]!.id; bad.run_attempt = 2; bad.conclusion = 'failure'; }
  if (fault === 'wrong-sha') runs[0]!.head_sha = 'b'.repeat(40);
  if (fault === 'fork') runs[0]!.head_repository = { full_name: 'other/fork' };
  if (fault === 'stale') runs[0]!.updated_at = new Date(now - 25 * 3600_000).toISOString();
  if (fault === 'skipped') bad.conclusion = 'skipped';
  if (!['wrong-sha', 'fork', 'stale'].includes(fault)) runs.push(bad);
  assert.throws(() => validatePreparation(checks, inputs, receipts, 'exports', runs, now));
});

test('consent quality partitions preserve the original selection once and keep the package runner', async () => {
  const check = getPredeployPlan([], { full: true }).checks.find(check => check.key === 'scan-core-consent-quality')!;
  const gate = [checks[0]!, check];
  assert.deepEqual(planShards(gate, inputs, { workers: 1 }).workers[0]![0]!.command, check.command);
  const plan = planShards(gate, inputs, { workers: 8 });
  const tasks = plan.workers.flat();
  assert.equal(tasks.length, 4);
  const prefixes = tasks.map(task => task.command.slice(0, -2));
  assert.ok(prefixes.every(prefix => JSON.stringify(prefix) === JSON.stringify(['pnpm', '--filter', '@certscore/scan-core', 'exec', 'node', '--import', 'tsx', '--test'])));
  const filters = tasks.map(task => new RegExp(task.command.at(-2)!.split('--test-name-pattern=')[1]!));
  const directory = new URL('../../packages/certscore-scan-core/', import.meta.url);
  const { readFile } = await import('node:fs/promises');
  const manifest = JSON.parse(await readFile(new URL('package.json', directory), 'utf8'));
  const original = new RegExp(manifest.scripts['test:integration-fixtures:consent'].match(/--test-name-pattern='([^']+)'/)![1]);
  const source = await readFile(new URL('src/integration-fixtures.test.ts', directory), 'utf8');
  const titles = [...source.matchAll(/^test\("([^"]+)"/gm)].map(match => match[1]!);
  assert.ok(titles.some(title => original.test(title)));
  for (const title of titles) assert.equal(filters.filter(filter => filter.test(title)).length, Number(original.test(title)), title);
  tasks[0]!.command = tasks[1]!.command;
  assert.throws(() => validateShardPlan(plan, gate), /partition coverage changed: scan-core-consent-quality/);
});

test('independently planned workers and aggregation agree on the complete manifest', () => {
  const gate = getPredeployPlan([], { full: true }).checks;
  const context = { environment: 'fixture', platform: 'linux', arch: 'x64' };
  const first = planShards(gate, inputs, { workers: 8, execution: context });
  const second = planShards(gate, inputs, { workers: 8, execution: context });
  assert.equal(first.checks.length, 38);
  assert.equal(first.workers.length, 8);
  assert.equal(digest(first), digest(second));
  assert.notEqual(digest(first), digest(planShards(gate, inputs, { workers: 6, execution: context })));
});

test('early web phase profiling reports durations without serializing trace payloads', async () => {
  const { nextBuildPhases } = await import('./next-build-phases');
  const dir = await mkdtemp(path.join(tmpdir(), 'next-build-phases-'));
  const trace = path.join(dir, 'trace');
  try {
    await writeFile(trace, `${JSON.stringify([{ name: 'worker-main-server', duration: 4300, tags: { detail: 'private' } }])}\n${JSON.stringify([
      { name: 'next-build', duration: 15000 }, { name: 'verify-typescript-setup', duration: 5000 }, { name: 'static-generation', duration: 1500 },
    ])}\n`);
    assert.deepEqual(await nextBuildPhases(trace), { serverCompileMs: 4, nextBuildMs: 15, typeValidationMs: 5, staticGenerationMs: 2 });
    await writeFile(trace, JSON.stringify([{ name: 'next-build', duration: 1 }, { name: 'next-build', duration: 2 }]));
    await assert.rejects(nextBuildPhases(trace), /ambiguous phase/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('suite assertions can replace only reviewed builds with the same worker’s export proof', async () => {
  const { verifiedSuiteCommand } = await import('./release-suite-reuse');
  const all = getPredeployPlan([], { full: true }).checks;
  const names = ['report-presentation', 'canonical-projection-parity', 'post-refusal-release'];
  const gate = [checks[0]!, ...all.filter(check => names.includes(check.key))];
  const { plan, results } = fixture(gate);
  assert.equal(gate.length, 4);
  for (const task of plan.workers.flat()) {
    const receipt = results.find(result => result.key === task.key)!;
    const assertions = verifiedSuiteCommand(task.command);
    assert.ok(assertions);
    receipt.command = assertions;
    receipt.reusedPackageExportsFingerprint = 'c'.repeat(64);
  }
  assert.doesNotThrow(() => aggregateShards(plan, gate, results, now));
  const receipt = results.find(result => result.reusedPackageExportsFingerprint)!;
  receipt.reusedPackageExportsFingerprint = 'd'.repeat(64);
  assert.throws(() => aggregateShards(plan, gate, results, now), /reused unverified package exports/);
  receipt.reusedPackageExportsFingerprint = undefined;
  assert.throws(() => aggregateShards(plan, gate, results, now), /identity\/configuration mismatch/);
});
