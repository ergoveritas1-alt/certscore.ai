import { readFile, readdir, writeFile, mkdir, lstat } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { getPredeployPlan } from './predeploy';
import { receiptMatches, releaseInputs } from './lib/release-receipts';
import { checkReleasePrerequisites } from './lib/release-prerequisites';
import { workspaceExportsFingerprint } from './lib/release-bootstrap';
import { verifiedSuiteCommand } from './lib/release-suite-reuse';
import { publishBootstrapArtifact, restoreBootstrapArtifact } from './lib/release-bootstrap-artifact';
import { aggregateShards, digest, planShards, shardExecutionContext, sharedBootstrapCommand, validateShardPlan, type ShardPlan, type ShardResult } from './lib/release-shards';

const args = process.argv.slice(2), mode = args.shift();
const values = new Map<string, string>();
for (let index = 0; index < args.length; index += 2) {
  const key = args[index]!, value = args[index + 1];
  if (!['--out', '--plan', '--workers', '--worker', '--timings', '--results', '--setup-ms', '--control-ms', '--file-timings', '--phase', '--bootstrap-in', '--bootstrap-out'].includes(key) || !value || values.has(key)) throw new Error('Invalid verification arguments.');
  values.set(key, value);
}
const phase = values.get('--phase');
if (phase && (mode !== 'worker' || !['bootstrap', 'workspace', 'build', 'remaining'].includes(phase))) throw new Error('Use a supported verification worker phase.');
if ((values.has('--bootstrap-in') && (mode !== 'worker' || phase)) ||
    (values.has('--bootstrap-out') && phase !== 'bootstrap')) throw new Error('Shared bootstrap arguments require the matching worker phase.');
const required = (key: string) => { const value = values.get(key); if (!value) throw new Error(`Missing ${key}.`); return value; };
const checks = getPredeployPlan([], { full: true }).checks;
const inputsForWorker = () => releaseInputs(process.cwd(), { portableDependencies: true });
async function immutable(file: string, value: unknown) {
  const bytes = `${JSON.stringify(value, null, 2)}\n`;
  if (Buffer.byteLength(bytes) > 2 * 1024 * 1024) throw new Error('Verification metadata exceeds its 2 MiB file bound.');
  await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, bytes, { flag: 'wx', mode: 0o600 });
}
async function run(command: string[], env = process.env) {
  return new Promise<number>((resolve, reject) => {
    const child = spawn(command[0]!, command.slice(1), { stdio: 'inherit', env });
    child.on('error', reject);
    child.on('exit', code => resolve(code ?? 1));
  });
}
async function main() {
  if (process.env.CERTSCORE_VERIFIED_PACKAGE_EXPORTS !== undefined) throw new Error('Bootstrap reuse must be established by the worker.');
  await checkReleasePrerequisites();
  if (mode === 'plan') {
    const retained = JSON.parse(await readFile('scripts/release-verification-timings.json', 'utf8'));
    const timings: Record<string, number> = { ...retained.timings };
    if (process.env.CERTSCORE_VERIFICATION_COLD_BUILD === '1') Object.assign(timings, retained.coldBenchmark?.timings);
    if (values.has('--timings')) for (const file of await readdir(required('--timings'))) {
      if (!file.endsWith('.json')) continue;
      const value = JSON.parse(await readFile(path.join(required('--timings'), file), 'utf8'));
      if (value.exitStatus === 0 && value.durationMs > 0) timings[value.key] = value.durationMs;
    }
    const inputs = await inputsForWorker();
    const fileTimings: Record<string, number> = { ...retained.fileTimings };
    if (values.has('--file-timings')) Object.assign(fileTimings, JSON.parse(await readFile(required('--file-timings'), 'utf8')));
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
    const assigned = plan.workers[worker]!;
    // Start the workspace build before other checks can warm its app outputs.
    const build = assigned.find(task => task.parent === 'workspace-build');
    const remaining = assigned.filter(task => task !== build);
    const out = required('--out'), planHash = digest(plan);
    const first = [{ key: bootstrap.key, command: bootstrap.command }, ...(build ? [build] : [])];
    if (phase && !build) throw new Error('Phased verification requires the worker assigned to the workspace build.');
    let verifiedExports: string | undefined;
    if (phase === 'remaining' || phase === 'workspace') {
      const setup: ShardResult = JSON.parse(await readFile(path.join(out, `${bootstrap.key}.json`), 'utf8'));
      if (setup.worker !== worker || setup.planHash !== planHash || JSON.stringify(setup.execution) !== JSON.stringify(plan.execution) ||
          !/^[a-f0-9]{64}$/.test(setup.outputsFingerprint ?? '') ||
          !receiptMatches({ ...setup, cwd: '.' }, { key: bootstrap.key, command: bootstrap.command, inputs: initial })) {
        throw new Error('The build phase did not complete workspace bootstrap for this worker.');
      }
      verifiedExports = setup.outputsFingerprint;
    }
    const tasks = phase === 'bootstrap' ? first.slice(0, 1) : phase === 'workspace' ? first.slice(1)
      : phase === 'build' ? first : phase === 'remaining' ? remaining : [...first, ...remaining];
    const failed: string[] = [];
    for (const task of tasks) {
      const before = await inputsForWorker();
      if (JSON.stringify(before) !== JSON.stringify(initial)) throw new Error('Worker inputs changed before execution.');
      const startedAt = new Date().toISOString(), start = performance.now(); let exitStatus = 1, outputsFingerprint: string | undefined;
      let reusedPackageExportsFingerprint = task === build && process.env.CERTSCORE_VERIFICATION_COLD_BUILD === '1' ? verifiedExports : undefined;
      let bootstrapSource: ShardResult['bootstrapSource'];
      let command = task.command;
      try {
        const source = values.get('--bootstrap-in');
        if (task.key === bootstrap.key && source && !build) {
          try {
            const file = path.join(source, 'receipt.json');
            const info = await lstat(file);
            if (!info.isFile() || info.size > 2 * 1024 * 1024) throw new Error('Invalid producer receipt.');
            const producer: ShardResult = JSON.parse(await readFile(file, 'utf8'));
            if (producer.bootstrapSource || producer.planHash !== planHash ||
                !plan.workers[producer.worker]?.some(candidate => candidate.parent === 'workspace-build') ||
                JSON.stringify(producer.execution) !== JSON.stringify(plan.execution) ||
                !/^[a-f0-9]{64}$/.test(producer.outputsFingerprint ?? '') ||
                !receiptMatches({ ...producer, cwd: '.' }, { key: bootstrap.key, command: bootstrap.command,
                  inputs: { ...initial, environment: producer.inputs.environment } }, Date.parse(startedAt))) {
              throw new Error('Shared bootstrap was not produced for this verification plan.');
            }
            await restoreBootstrapArtifact(source, producer.outputsFingerprint!);
            bootstrapSource = { worker: producer.worker, receiptHash: digest(producer) };
            command = sharedBootstrapCommand;
          } catch (error) {
            console.warn(`Shared bootstrap unavailable; compiling locally. ${error instanceof Error ? error.message : String(error)}`);
          }
        }
        const suite = verifiedExports ? verifiedSuiteCommand(command) : null;
        if (suite && await workspaceExportsFingerprint().catch(() => undefined) === verifiedExports) {
          command = suite;
          reusedPackageExportsFingerprint = verifiedExports;
        }
        console.log(`Worker ${worker}: ${task.key}\n$ ${command.join(' ')}`);
        const buildEnv = task === build ? {
          ...process.env,
          CERTSCORE_WORKSPACE_BUILD_TIMING_FILE: path.resolve(out, 'workspace-build-phases.ndjson'),
          ...(reusedPackageExportsFingerprint ? { CERTSCORE_VERIFIED_PACKAGE_EXPORTS: reusedPackageExportsFingerprint } : {}),
        } : process.env;
        const status = bootstrapSource ? 0 : await run(command, buildEnv);
        if (task.key === bootstrap.key) {
          if (status !== 0) throw new Error(`Workspace bootstrap failed (${status}).`);
          outputsFingerprint = await workspaceExportsFingerprint();
          const imports = await run([process.execPath, 'scripts/release-node.mjs', 'scripts/check-regional-web-bot-auth.ts', '--check-imports']);
          if (imports !== 0) throw new Error(`Bootstrap import check failed (${imports}).`);
        }
        const after = await inputsForWorker();
        if (JSON.stringify(after) !== JSON.stringify(initial)) throw new Error('Worker inputs changed during execution.');
        if (task.key === bootstrap.key) verifiedExports = outputsFingerprint;
        exitStatus = status;
        if (status !== 0) {
          failed.push(task.key);
          console.error(`Check ${task.key} failed (${status}). Continuing with independent checks.`);
        }
      } finally {
        const result: ShardResult = { version: 1, planHash, worker, key: task.key, command,
          inputs: before, execution: shardExecutionContext(), outputsFingerprint, bootstrapSource, reusedPackageExportsFingerprint, startedAt, completedAt: new Date().toISOString(), durationMs: performance.now() - start, exitStatus };
        const filename = phase && phase !== 'remaining' ? `${task === build ? build.parent : bootstrap.key}.json` : `${worker}-${randomUUID()}.json`;
        await immutable(path.join(out, filename), result);
        const destination = values.get('--bootstrap-out');
        if (destination && exitStatus === 0) {
          try { await publishBootstrapArtifact(destination, result); }
          catch (error) { console.warn(`Shared bootstrap could not be exported. ${error instanceof Error ? error.message : String(error)}`); }
        }
      }
    }
    if (failed.length) throw new Error(`Verification failures (${failed.length}): ${failed.join(', ')}`);
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
