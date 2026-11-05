import { createHash } from 'node:crypto';
import { globSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Check } from '../predeploy';
import { verifiedSuiteCommand } from './release-suite-reuse';
import { releaseEnvironmentFingerprint, type ReleaseInputs } from './release-receipts';

export const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const sharedBootstrapCommand = ['restore-verified-workspace-bootstrap'];
export type ShardTask = { key: string; parent: string; command: string[]; files: string[]; estimatedMs: number };
type ReplayMove = { key: string; from: number; to: number; typecheckSliceMs?: number };
export type ShardPlan = {
  version: 1; sha: string; sourceFingerprint: string; checks: Check[]; workers: ShardTask[][];
  execution: { environment: string; platform: string; arch: string };
  estimates: { kind: 'scheduling-model'; bootstrapMs: number; workerMs: number[]; setupMsPerWorker: number; controlPlaneMs: number; estimatedWallMs: number };
};
export type ShardResult = {
  version: 1; planHash: string; worker: number; key: string; command: string[]; inputs: ReleaseInputs;
  execution: ShardPlan['execution'];
  outputsFingerprint?: string;
  bootstrapSource?: { worker: number; receiptHash: string };
  reusedPackageExportsFingerprint?: string;
  startedAt: string; completedAt: string; durationMs: number; exitStatus: number;
};

export function shardExecutionContext(environment: NodeJS.ProcessEnv = process.env, root = process.cwd()) {
  // Runner/step transport metadata is not application configuration. Unknown
  // variables, NODE_OPTIONS, security flags and all feature flags remain bound.
  const metadata = /^(?:RUNNER_NAME|RUNNER_TRACKING_ID|GITHUB_JOB|GITHUB_ACTION|GITHUB_ENV|GITHUB_OUTPUT|GITHUB_STATE|GITHUB_STEP_SUMMARY|GITHUB_PATH|ACTIONS_RUNTIME_TOKEN|ACTIONS_RUNTIME_URL|ACTIONS_CACHE_URL|ACTIONS_RESULTS_URL)$/;
  const normalized: NodeJS.ProcessEnv = { ...environment };
  for (const [key, value] of Object.entries(normalized)) {
    if (metadata.test(key)) delete normalized[key];
    else normalized[key] = value?.split(root).join('<workspace>');
  }
  return { environment: releaseEnvironmentFingerprint(normalized), platform: process.platform, arch: process.arch };
}

// Only literal file lists at the end of reviewed direct test commands are split.
// Options, filters, loaders, cwd and internal test concurrency are preserved.
export function directTestFiles(command: string[]) {
  const direct = command[0] === 'pnpm' && command[1] === 'exec' && command[2] === 'tsx';
  if (!direct || !command.includes('--test')) return null;
  const first = command.findIndex(value => /\.(?:test|spec)\.(?:ts|tsx|mjs|mts)$/.test(value));
  if (first < 0) return null;
  const files = command.slice(first);
  if (files.some(file => !/^[\w./-]+\.(?:test|spec)\.(?:ts|tsx|mjs|mts)$/.test(file) || file.startsWith('/') || file.split('/').includes('..')) || new Set(files).size !== files.length) return null;
  return { prefix: command.slice(0, first), files };
}

function partitionableTestFiles(check: Check) {
  if (check.key !== 'scan-core-policy-full') return directTestFiles(check.command);

  // The package runs these fixtures from its own cwd. Preserve its loader,
  // concurrency cap and entire glob, and require review if the wrapper changes.
  const packageCommand = ['pnpm', '--filter', '@certscore/scan-core'];
  const script = 'test:policy:full';
  const runner = ['node', '--import', 'tsx', '--test', '--test-concurrency=2'];
  const pattern = 'src/test-shards/policy-surface-scanner-*.test.ts';
  const directory = new URL('../../packages/certscore-scan-core/', import.meta.url);
  const { scripts } = JSON.parse(readFileSync(new URL('package.json', directory), 'utf8'));
  if (JSON.stringify(check.command) !== JSON.stringify([...packageCommand, script]) ||
      scripts?.[script] !== `${runner.join(' ')} '${pattern}'` || scripts?.[`pre${script}`] || scripts?.[`post${script}`]) {
    throw new Error('Review the scan-core policy shard command before partitioning.');
  }
  const files = globSync(pattern, { cwd: fileURLToPath(directory) }).sort();
  if (files.length === 0) throw new Error('No scan-core policy shards found.');
  return { prefix: [...packageCommand, 'exec', ...runner], files };
}

function workspaceTypecheckPartitions(check: Check, splitNonWeb = false) {
  const full = ['pnpm', 'turbo', 'run', 'typecheck', '--concurrency=2'];
  if (JSON.stringify(check.command) !== JSON.stringify(full)) throw new Error('Review the workspace typecheck command before partitioning.');
  const web = '@website-signal-risk-scanner/web';
  // Bootstrap already produced the dependency outputs. Their typechecks run
  // in the complementary partition, so only run the selected app tasks here.
  const webPartition = { key: 'workspace-typecheck:web', command: [...full, '--only', `--filter=${web}`] };
  const other = { key: 'workspace-typecheck:other', command: [...full, `--filter=!${web}`] };
  if (!splitNonWeb) return [webPartition, other] as const;

  const workerApps = ['@website-signal-risk-scanner/v2-dag-lambda', '@website-signal-risk-scanner/validation-worker'];
  const remaining = { ...other, command: [...other.command, ...workerApps.map(name => `--filter=!${name}`)] };
  const moved = { key: 'workspace-typecheck:worker-apps', command: [...full, '--only', ...workerApps.map(name => `--filter=${name}`)] };
  return [webPartition, remaining, moved] as const;
}

function consentQualityPartitions(check: Check) {
  const packageCommand = ['pnpm', '--filter', '@certscore/scan-core'];
  const script = 'test:integration-fixtures:consent';
  const runner = ['node', '--import', 'tsx', '--test'];
  const file = 'src/integration-fixtures.test.ts';
  const pattern = 'first-layer|choice controls|CMP recapture|CMP script|supplemental full-page|off-viewport|bare generic|post-screenshot consent|ambiguous consent|soft module deadline|parent scan is cancelled';
  const { scripts } = JSON.parse(readFileSync(new URL('../../packages/certscore-scan-core/package.json', import.meta.url), 'utf8'));
  if (JSON.stringify(check.command) !== JSON.stringify([...packageCommand, script]) ||
      scripts?.[script] !== `${runner.join(' ')} --test-name-pattern='${pattern}' ${file}` || scripts?.[`pre${script}`] || scripts?.[`post${script}`]) {
    throw new Error('Review the consent quality command before partitioning.');
  }
  // Balance the expensive fixture cases using timings from run 41990304522.
  // Earlier selectors are excluded, and the last partition takes the remainder.
  const selectors = [
    'keeps high-confidence CMP recapture|performs a structured read after supplemental full-page capture|avoids long post-screenshot consent recapture',
    'render in separate waves|context-confirmed off-viewport approval|retained ambiguous consent surfaces',
    'off-viewport footer settings|off-viewport controls inside|dismiss-only first-layer',
  ];
  return [...selectors, ''].map((selector, index) => {
    const any = '[\\s\\S]*';
    const earlier = selectors.slice(0, index).join('|');
    const filter = `^(?=${any}(?:${pattern}))${earlier ? `(?!${any}(?:${earlier}))` : ''}${selector ? `(?=${any}(?:${selector}))` : ''}`;
    return { key: `${check.key}:${index}`, command: [...packageCommand, 'exec', ...runner, `--test-name-pattern=${filter}`, file] };
  });
}

function commandPartitions(check: Check, splitNonWeb = false) {
  if (check.key === 'workspace-typecheck') return workspaceTypecheckPartitions(check, splitNonWeb);
  if (check.key === 'scan-core-consent-quality') return consentQualityPartitions(check);
  return null;
}

function withTaskKey(task: ShardTask): ShardTask {
  return { ...task, key: `${task.parent}:${digest(task.command).slice(0, 16)}` };
}

export function planShards(checks: Check[], inputs: Pick<ReleaseInputs, 'sha' | 'fingerprint'>,
  options: { workers: number; timings?: Record<string, number>; fileTimings?: Record<string, number>; setupMsPerWorker?: number; controlPlaneMs?: number; execution?: ShardPlan['execution']; replayMoves?: readonly ReplayMove[] }) : ShardPlan {
  if (!Number.isInteger(options.workers) || options.workers < 1 || options.workers > 8) throw new Error('Use 1–8 isolated workers.');
  if (new Set(checks.map(check => check.key)).size !== checks.length || !checks.some(check => check.key === 'workspace-package-build')) throw new Error('Invalid parent check inventory.');
  const timings = options.timings ?? {}, tasks: ShardTask[] = [];
  for (const check of checks) {
    if (check.key === 'workspace-package-build') continue;
    const split = partitionableTestFiles(check), estimate = timings[check.key] ?? 30_000;
    if (!Number.isFinite(estimate) || estimate <= 0) throw new Error('Invalid timing profile.');
    const partitions = options.workers > 1 ? commandPartitions(check) : null;
    if (partitions) {
      for (const partition of partitions) {
        const estimatedMs = timings[partition.key] ?? estimate / partitions.length;
        if (!Number.isFinite(estimatedMs) || estimatedMs <= 0) throw new Error('Invalid partition timing profile.');
        tasks.push({ ...partition, parent: check.key, files: [], estimatedMs });
      }
      continue;
    }
    if (!split) tasks.push({ key: check.key, parent: check.key, command: check.command, files: [], estimatedMs: estimate });
    else for (const file of split.files) {
      const estimateMs = options.fileTimings?.[`${check.key}:${file}`] ?? estimate / split.files.length;
      if (!Number.isFinite(estimateMs) || estimateMs <= 0) throw new Error('Invalid file timing profile.');
      tasks.push({ key: `${check.key}:${file}`, parent: check.key, command: [...split.prefix, file], files: [file], estimatedMs: estimateMs });
    }
  }
  const workers: ShardTask[][] = Array.from({ length: options.workers }, () => []), totals = workers.map(() => 0);
  // Bound per-worker policy files so a single policy shard cannot absorb the tail.
  const policyLimit = Math.ceil(tasks.filter(task => task.parent === 'scan-core-policy-full').length / options.workers) + 1;
  for (const task of tasks.sort((a, b) => b.estimatedMs - a.estimatedMs || a.key.localeCompare(b.key))) {
    let index = 0;
    if (task.parent === 'scan-core-policy-full') {
      index = totals.reduce((best, total, worker) => workers[worker]!.filter(candidate => candidate.parent === task.parent).length < policyLimit &&
        (best === -1 || total < totals[best]!) ? worker : best, -1);
    } else index = totals.indexOf(Math.min(...totals));
    workers[index]!.push(task);
    totals[index]! += task.estimatedMs;
  }
  // One invocation per parent per worker limits repeated process/loader startup.
  const merged = workers.map(tasks => {
    const groups = new Map<string, ShardTask>();
    for (const task of tasks) {
      const group = task.files.length ? task.parent : task.key;
      const prior = groups.get(group);
      if (prior && task.files.length) { prior.files.push(...task.files); prior.command.push(...task.files); prior.estimatedMs += task.estimatedMs; }
      else groups.set(group, { ...task, files: [...task.files], command: [...task.command] });
    }
    return [...groups.values()].map(withTaskKey);
  });
  // Only replay a measured command when the current inventory still places it
  // on its original worker. Leave other worker counts and regrouped tasks alone.
  for (const { key, from, to, typecheckSliceMs } of options.replayMoves ?? []) {
    const source = merged[from], destination = merged[to];
    const index = source?.findIndex(task => task.key === key) ?? -1;
    if (!source || !destination || index === -1) continue;
    const task = source[index]!;
    if (task.parent === 'scan-core-policy-full' && destination.some(candidate => candidate.parent === task.parent)) continue;
    let moved = task;
    if (typecheckSliceMs !== undefined) {
      const check = checks.find(candidate => candidate.key === task.parent)!;
      if (task.parent !== 'workspace-typecheck' || JSON.stringify(task.command) !== JSON.stringify(workspaceTypecheckPartitions(check)[1].command) ||
          !Number.isFinite(typecheckSliceMs) || typecheckSliceMs <= 0 || typecheckSliceMs >= task.estimatedMs) {
        throw new Error('Invalid workspace typecheck replay partition.');
      }
      const [, remaining, workerApps] = workspaceTypecheckPartitions(check, true);
      if (!workerApps) throw new Error('Missing workspace typecheck replay partition.');
      source[index] = withTaskKey({ ...task, command: remaining.command, estimatedMs: task.estimatedMs - typecheckSliceMs });
      moved = withTaskKey({ ...task, command: workerApps.command, estimatedMs: typecheckSliceMs });
    } else {
      source.splice(index, 1);
    }
    // Keep a relocated test command intact even when the receiver already runs
    // another shard of that check. The worker still runs each command serially.
    destination.push(moved);
    totals[from]! -= moved.estimatedMs;
    totals[to]! += moved.estimatedMs;
  }
  const bootstrapMs = timings['workspace-package-build'] ?? 20_000;
  const setupMsPerWorker = options.setupMsPerWorker ?? 60_000;
  const controlPlaneMs = options.controlPlaneMs ?? 60_000;
  if (![bootstrapMs, setupMsPerWorker, controlPlaneMs].every(value => Number.isFinite(value) && value >= 0)) throw new Error('Invalid setup estimate.');
  const plan: ShardPlan = { version: 1, sha: inputs.sha, sourceFingerprint: inputs.fingerprint, checks, workers: merged, execution: options.execution ?? shardExecutionContext(),
    estimates: { kind: 'scheduling-model', bootstrapMs, workerMs: totals, setupMsPerWorker, controlPlaneMs,
      estimatedWallMs: Math.max(...totals) + bootstrapMs + setupMsPerWorker + controlPlaneMs } };
  validateShardPlan(plan, checks); return plan;
}

export function validateShardPlan(plan: ShardPlan, expectedChecks: Check[]) {
  if (plan.version !== 1 || !/^[a-f0-9]{40}$/.test(plan.sha) || JSON.stringify(plan.checks) !== JSON.stringify(expectedChecks) || !plan.workers.length || plan.workers.length > 8) throw new Error('Shard inventory does not match the required gate.');
  const all = plan.workers.flat(), keys = all.map(task => task.key);
  if (new Set(keys).size !== keys.length || all.some(task => !expectedChecks.some(check => check.key === task.parent && check.key !== 'workspace-package-build'))) throw new Error('Duplicate or unknown shard task.');
  for (const parent of expectedChecks) {
    if (parent.key === 'workspace-package-build') continue;
    const tasks = all.filter(task => task.parent === parent.key), split = partitionableTestFiles(parent);
    if (!tasks.length) throw new Error(`Missing check ${parent.key}.`);
    const partitions = tasks.length > 1 ? commandPartitions(parent, plan.workers.length === 8 && tasks.length === 3) : null;
    if (partitions) {
      const required = partitions.map(task => JSON.stringify(task.command)).sort();
      const actual = tasks.map(task => JSON.stringify(task.command)).sort();
      if (tasks.some(task => task.files.length) || JSON.stringify(required) !== JSON.stringify(actual)) throw new Error(`Command partition coverage changed: ${parent.key}.`);
      continue;
    }
    if (!split) {
      if (tasks.length !== 1 || tasks[0]!.files.length || JSON.stringify(tasks[0]!.command) !== JSON.stringify(parent.command)) throw new Error(`Opaque command changed: ${parent.key}.`);
    } else {
      const files = tasks.flatMap(task => task.files);
      if (files.length !== split.files.length || new Set(files).size !== files.length || [...files].sort().join('\0') !== [...split.files].sort().join('\0')) throw new Error(`Missing/duplicate files: ${parent.key}.`);
      for (const task of tasks) if (!task.files.length || JSON.stringify(task.command) !== JSON.stringify([...split.prefix, ...task.files])) throw new Error(`Test configuration changed: ${parent.key}.`);
    }
  }
}

export function aggregateShards(plan: ShardPlan, expectedChecks: Check[], results: ShardResult[], now = Date.now()) {
  validateShardPlan(plan, expectedChecks);
  const planHash = digest(plan);
  const bootstrap = expectedChecks.find(check => check.key === 'workspace-package-build')!;
  const expected = plan.workers.flatMap((tasks, worker) => [{ worker, key: 'workspace-package-build', command: bootstrap.command }, ...tasks.map(task => ({ worker, key: task.key, command: task.command }))]);
  if (results.length !== expected.length) throw new Error('Missing, duplicate or unexpected shard results.');
  const seen = new Set<string>();
  for (const result of results) {
    const id = `${result.worker}:${result.key}`, match = expected.find(value => value.worker === result.worker && value.key === result.key);
    const suite = match && result.reusedPackageExportsFingerprint !== undefined ? verifiedSuiteCommand(match.command) : null;
    const command = result.bootstrapSource ? sharedBootstrapCommand : suite ?? match?.command;
    if (seen.has(id) || !match || (result.bootstrapSource && result.key !== bootstrap.key) || result.version !== 1 || result.planHash !== planHash || JSON.stringify(result.command) !== JSON.stringify(command) || JSON.stringify(result.execution) !== JSON.stringify(plan.execution)) throw new Error('Shard result identity/configuration mismatch.');
    seen.add(id);
    const start = Date.parse(result.startedAt), end = Date.parse(result.completedAt);
    if (result.exitStatus !== 0 || result.inputs.clean !== true || result.inputs.sha !== plan.sha || result.inputs.fingerprint !== plan.sourceFingerprint || !Number.isFinite(result.durationMs) || result.durationMs < 0 || !Number.isFinite(start) || !Number.isFinite(end) || end < start || end > now || now - end > 24 * 60 * 60 * 1000) throw new Error('Failed, dirty, stale or incomplete shard result.');
  }
  for (let worker = 0; worker < plan.workers.length; worker++) {
    const own = results.filter(result => result.worker === worker), setup = own.find(result => result.key === 'workspace-package-build')!;
    const build = plan.workers[worker]!.find(task => task.parent === 'workspace-build');
    if (!/^[a-f0-9]{64}$/.test(setup.outputsFingerprint ?? '')) throw new Error('Worker bootstrap export proof missing.');
    if (setup.bootstrapSource) {
      const producer = results.find(result => result.worker === setup.bootstrapSource!.worker && result.key === bootstrap.key);
      if (!producer || producer.bootstrapSource || producer.worker === worker ||
          !plan.workers[producer.worker]?.some(task => task.parent === 'workspace-build') ||
          digest(producer) !== setup.bootstrapSource.receiptHash || producer.outputsFingerprint !== setup.outputsFingerprint ||
          Date.parse(producer.completedAt) > Date.parse(setup.startedAt)) throw new Error('Shared bootstrap receipt does not match the original build worker.');
    }
    for (const result of own) {
      if (['sha', 'fingerprint', 'environment', 'node', 'pnpm'].some(key => result.inputs[key as keyof ReleaseInputs] !== setup.inputs[key as keyof ReleaseInputs]) || (result !== setup && Date.parse(result.startedAt) < Date.parse(setup.completedAt))) throw new Error('Worker inputs changed or dependency order violated.');
      const task = plan.workers[worker]!.find(candidate => candidate.key === result.key);
      if (result.reusedPackageExportsFingerprint !== undefined &&
          ((result.key !== build?.key && !(task && (verifiedSuiteCommand(task.command) || task.parent === 'workspace-typecheck'))) ||
            result.reusedPackageExportsFingerprint !== setup.outputsFingerprint)) throw new Error('Verification reused unverified package exports.');
    }
  }
  const toolchain = results[0]!.inputs;
  if (results.some(result => result.inputs.node !== toolchain.node || result.inputs.pnpm !== toolchain.pnpm)) throw new Error('Worker toolchains differ.');
  return { version: 1, kind: 'partitioned-verification' as const, planHash, sha: plan.sha,
    completedAt: new Date(Math.max(...results.map(result => Date.parse(result.completedAt)))).toISOString(),
    parentChecks: expectedChecks.map(check => check.key), successfulExecutions: results.length,
    note: 'Partition coverage proof; does not impersonate whole-command receipts, replace required CI or authorize deployment.' };
}
