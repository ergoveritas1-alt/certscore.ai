import { mkdir, writeFile } from 'node:fs/promises';
import { spawn, execFileSync } from 'node:child_process';
import { availableParallelism, totalmem, freemem } from 'node:os';
import path from 'node:path';
import { releaseInputs } from './lib/release-receipts';

// Reviewed owned fixtures: ephemeral loopback ports; fresh browser contexts;
// mocked external requests; no shared fixture files or production services.
const files = ['consent-action-late-label.test.ts', 'consent-request-clock.test.ts',
  'onetrust-loading-resolution.test.ts', 'cmp-control-actionability-deadline.test.ts']
  .map(file => `packages/certscore-scan-core/src/${file}`);
type Measurement = { file: string; command: string[]; durationMs: number; exitStatus: number; tests: string[] };
async function main() {
  if (process.argv.length !== 4 || process.argv[2] !== '--out') throw new Error('Use --out <new directory>.');
  const out = path.resolve(process.argv[3]!); await mkdir(out, { recursive: true });
  let available = freemem();
  if (process.platform === 'darwin') {
    const percent = execFileSync('memory_pressure', ['-Q'], { encoding: 'utf8' }).match(/System-wide memory free percentage: (\d+)%/);
    if (!percent) throw new Error('Memory availability unknown.'); available = totalmem() * Number(percent[1]) / 100;
  }
  if (availableParallelism() < 2 || available < 8.5 * 1024 ** 3) throw new Error('Benchmark requires two CPUs and 8 GiB plus reserve.');
  const initial = await releaseInputs(), measurements: { lanes: number; wallMs: number; commandTotalMs: number; executions: Measurement[] }[] = [];
  let failure: unknown;
  try {
    for (const lanes of [1, 2]) {
      const start = performance.now(), executions: Measurement[] = [];
      const pending = [...files];
      if (lanes === 2) pending.sort((a, b) => measurements[0]!.executions.find(value => value.file === b)!.durationMs - measurements[0]!.executions.find(value => value.file === a)!.durationMs);
      let stopped = false;
      const batch = await Promise.allSettled(Array.from({ length: lanes }, async () => {
        while (pending.length && !stopped) {
          const file = pending.shift()!, index = files.indexOf(file);
          const command = ['pnpm', 'exec', 'tsx', '--tsconfig', 'tsconfig.base.json', '--test', '--test-concurrency=2', file];
          const started = performance.now(); let output = '';
          const exitStatus = await new Promise<number>((resolve, reject) => {
            const child = spawn(command[0]!, command.slice(1), { stdio: ['ignore', 'pipe', 'pipe'] });
            child.stdout.on('data', chunk => { output += chunk; }); child.stderr.on('data', chunk => { output += chunk; });
            child.on('error', reject); child.on('close', code => resolve(code ?? 1));
          });
          await writeFile(path.join(out, `${lanes}-lanes-${index}.log`), output, { flag: 'wx', mode: 0o600 });
          const measurement = { file, command, durationMs: Math.round(performance.now() - started), exitStatus,
            tests: [...output.matchAll(/^ok \d+ - (.+)$/gm)].map(match => match[1]!).sort() };
          executions.push(measurement);
          if (exitStatus || !measurement.tests.length) { stopped = true; throw new Error(`Benchmark failed: ${file}.`); }
        }
      }));
      measurements.push({ lanes, wallMs: Math.round(performance.now() - start), commandTotalMs: executions.reduce((sum, value) => sum + value.durationMs, 0), executions });
      const rejected = batch.find(value => value.status === 'rejected');
      if (rejected?.status === 'rejected') throw rejected.reason;
      console.log(JSON.stringify({ lanes, wallMs: measurements.at(-1)!.wallMs, commandTotalMs: measurements.at(-1)!.commandTotalMs }));
    }
    for (const file of files) {
      const one = measurements[0]!.executions.find(value => value.file === file)!, two = measurements[1]!.executions.find(value => value.file === file)!;
      if (JSON.stringify(one.tests) !== JSON.stringify(two.tests)) throw new Error(`Assertion inventory changed: ${file}.`);
    }
  } catch (error) { failure = error; }
  const after = await releaseInputs();
  if (JSON.stringify(initial) !== JSON.stringify(after)) failure ??= new Error('Benchmark source/configuration changed.');
  await writeFile(path.join(out, 'result.json'), `${JSON.stringify({ version: 1, kind: 'measurement-only', inputs: initial,
    sharedMemoryReservationMiB: 8192, scheduling: 'serial then duration-balanced two-lane queue', availableMiBBefore: Math.round(available / 1024 ** 2), measurements,
    assertionInventoryEqual: !failure && measurements.length === 2, exitStatus: failure ? 1 : 0,
    limitations: 'Four owned fixture files on one host; 1→2 process lanes. Not a full-gate or hosted 6/8-runner benchmark. Browser clocks and deadlines unchanged.' }, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
  if (failure) throw failure;
}
main().catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
