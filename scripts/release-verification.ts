import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { getPredeployPlan } from './predeploy';
import { releaseInputs } from './lib/release-receipts';
import { checkReleasePrerequisites } from './lib/release-prerequisites';
import { workspaceExportsFingerprint } from './lib/release-bootstrap';
import { aggregateShards, digest, planShards, shardExecutionContext, validateShardPlan, type ShardPlan, type ShardResult } from './lib/release-shards';

const args = process.argv.slice(2), mode = args.shift();
const values = new Map<string, string>();
for (let index = 0; index < args.length; index += 2) {
  const key = args[index]!, value = args[index + 1];
  if (!['--out', '--plan', '--workers', '--worker', '--timings', '--results', '--setup-ms', '--control-ms', '--file-timings'].includes(key) || !value || values.has(key)) throw new Error('Invalid verification arguments.');
  values.set(key, value);
}
const required = (key: string) => { const value = values.get(key); if (!value) throw new Error(`Missing ${key}.`); return value; };
const checks = getPredeployPlan([], { full: true }).checks;
const inputsForWorker = () => releaseInputs(process.cwd(), { portableDependencies: true });
async function immutable(file: string, value: unknown) {
  const bytes = `${JSON.stringify(value, null, 2)}\n`;
  if (Buffer.byteLength(bytes) > 2 * 1024 * 1024) throw new Error('Verification metadata exceeds its 2 MiB file bound.');
  await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, bytes, { flag: 'wx', mode: 0o600 });
}
async function run(command: string[]) {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command[0]!, command.slice(1), { stdio: 'inherit' });
    child.on('error', reject); child.on('exit', code => code === 0 ? resolve() : reject(new Error(`Verification command failed (${code ?? 'signal'}).`)));
  });
}
async function main() {
  await checkReleasePrerequisites();
  if (mode === 'plan') {
    const retained = JSON.parse(await readFile('scripts/release-verification-timings.json', 'utf8'));
    const timings: Record<string, number> = { ...retained.timings };
    if (values.has('--timings')) for (const file of await readdir(required('--timings'))) {
      if (!file.endsWith('.json')) continue;
      const value = JSON.parse(await readFile(path.join(required('--timings'), file), 'utf8'));
      if (value.exitStatus === 0 && value.durationMs > 0) timings[value.key] = value.durationMs;
    }
    const inputs = await inputsForWorker();
    const fileTimings = values.has('--file-timings') ? JSON.parse(await readFile(required('--file-timings'), 'utf8')) : undefined;
    const plan = planShards(checks, inputs, { workers: Number(values.get('--workers') ?? 1), timings, fileTimings,
      setupMsPerWorker: Number(values.get('--setup-ms') ?? 60_000), controlPlaneMs: Number(values.get('--control-ms') ?? 60_000) });
    await immutable(required('--out'), plan);
    console.log(JSON.stringify({ planHash: digest(plan), workers: plan.workers.length, parentChecks: checks.length, estimates: plan.estimates, caveat: 'Scheduling model; file estimates are equal shares until measured. Queueing, cache misses and hardware differences remain unmeasured.' })); return;
  }
  const plan = JSON.parse(await readFile(required('--plan'), 'utf8')) as ShardPlan;
  validateShardPlan(plan, checks);
  const initial = await inputsForWorker();
  if (!initial.clean || initial.sha !== plan.sha || initial.fingerprint !== plan.sourceFingerprint || JSON.stringify(shardExecutionContext()) !== JSON.stringify(plan.execution)) throw new Error('Verification requires the exact clean planned source, execution configuration and installed inputs.');
  if (mode === 'worker') {
    const worker = Number(required('--worker'));
    if (!Number.isInteger(worker) || !plan.workers[worker]) throw new Error('Invalid worker.');
    const bootstrap = checks.find(check => check.key === 'workspace-package-build')!;
    const tasks = [{ key: bootstrap.key, command: bootstrap.command }, ...plan.workers[worker]!];
    for (const task of tasks) {
      const before = await inputsForWorker();
      if (JSON.stringify(before) !== JSON.stringify(initial)) throw new Error('Worker inputs changed before execution.');
      const startedAt = new Date().toISOString(), start = performance.now(); let exitStatus = 1, outputsFingerprint: string | undefined;
      console.log(`Worker ${worker}: ${task.key}\n$ ${task.command.join(' ')}`);
      try {
        await run(task.command);
        if (task.key === bootstrap.key) {
          outputsFingerprint = await workspaceExportsFingerprint();
          await run([process.execPath, 'scripts/release-node.mjs', 'scripts/check-regional-web-bot-auth.ts', '--check-imports']);
        }
        const after = await inputsForWorker();
        if (JSON.stringify(after) !== JSON.stringify(initial)) throw new Error('Worker inputs changed during execution.');
        exitStatus = 0;
      } finally {
        const result: ShardResult = { version: 1, planHash: digest(plan), worker, key: task.key, command: task.command,
          inputs: before, execution: shardExecutionContext(), outputsFingerprint, startedAt, completedAt: new Date().toISOString(), durationMs: performance.now() - start, exitStatus };
        await immutable(path.join(required('--out'), `${worker}-${randomUUID()}.json`), result);
      }
    }
    return;
  }
  if (mode === 'aggregate') {
    const results: ShardResult[] = [];
    let totalBytes = 0;
    for (const file of await readdir(required('--results'))) if (file.endsWith('.json')) {
      const bytes = await readFile(path.join(required('--results'), file)); totalBytes += bytes.length;
      if (bytes.length > 2 * 1024 * 1024 || totalBytes > 32 * 1024 * 1024 || results.length >= 512) throw new Error('Verification result inventory exceeds its bound.');
      results.push(JSON.parse(bytes.toString('utf8')));
    }
    const proof = aggregateShards(plan, checks, results);
    await immutable(required('--out'), proof); console.log(JSON.stringify(proof)); return;
  }
  throw new Error('Use plan, worker or aggregate.');
}
main().catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
