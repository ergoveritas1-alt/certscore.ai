import assert from 'node:assert/strict';
import test from 'node:test';
import { getPredeployPlan } from '../predeploy';
import { aggregateShards, digest, directTestFiles, planShards, shardExecutionContext, validateShardPlan, type ShardResult } from './release-shards';
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
const fixture = () => {
  const plan = planShards(checks, inputs, { workers: 2 });
  const results: ShardResult[] = plan.workers.flatMap((tasks, worker) => [checks[0]!, ...tasks].map(task => ({
    version: 1, planHash: digest(plan), worker, key: task.key, command: task.command, inputs: { ...inputs }, execution: plan.execution, outputsFingerprint: task.key === checks[0]!.key ? 'c'.repeat(64) : undefined,
    startedAt: new Date(now - (task.key === checks[0]!.key ? 3000 : 2000)).toISOString(), completedAt: new Date(now - (task.key === checks[0]!.key ? 2500 : 1000)).toISOString(), durationMs: 500, exitStatus: 0,
  })));
  return { plan, results };
};

test('all 38 canonical parent checks retain exact partition coverage at 1/2/4/6/8 workers', () => {
  const full = getPredeployPlan([], { full: true }).checks;
  for (const workers of [1, 2, 4, 6, 8]) {
    const plan = planShards(full, inputs, { workers });
    assert.equal(plan.checks.length, full.length); validateShardPlan(plan, full);
    assert.equal(plan.workers.length, workers);
    assert.equal(plan.estimates.kind, 'scheduling-model');
  }
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
