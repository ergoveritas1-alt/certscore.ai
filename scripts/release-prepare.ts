import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { getPredeployPlan } from './predeploy';
import { releaseInputs } from './lib/release-receipts';
import { workspaceExportsFingerprint } from './lib/release-bootstrap';
import { checkReleasePrerequisites } from './lib/release-prerequisites';
import { validatePartitionPreparation, validatePreparation, type CiRun } from './lib/release-preparation';
import { shardExecutionContext, type ShardPlan, type ShardResult } from './lib/release-shards';
const exec = promisify(execFile);
async function metadata(directory: string) {
  const files = (await readdir(directory)).filter(file => file.endsWith('.json'));
  if (files.length > 512) throw new Error('Verification directory exceeds its bounded inventory.');
  const paths = files.map(file => path.join(directory, file));
  const sizes = await Promise.all(paths.map(async file => (await stat(file)).size));
  if (sizes.some(size => size > 2 * 1024 * 1024) || sizes.reduce((sum, size) => sum + size, 0) > 32 * 1024 * 1024) throw new Error('Verification metadata exceeds its byte bound.');
  return Promise.all(paths.map(async file => JSON.parse(await readFile(file, 'utf8'))));
}
async function readPlan(file: string): Promise<ShardPlan> {
  if ((await stat(file)).size > 2 * 1024 * 1024) throw new Error('Partition plan exceeds its byte bound.');
  return JSON.parse(await readFile(file, 'utf8'));
}
async function main() {
  const args = process.argv.slice(2);
  const options = new Map<string, string>();
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i]!, value = args[i + 1];
    if (!['--receipts', '--partition-plan', '--partition-results', '--out', '--preview-mode', '--preview-base'].includes(key) || !value || options.has(key)) throw new Error('Invalid preparation arguments.');
    options.set(key, value);
  }
  const receiptsDir = options.get('--receipts'), planFile = options.get('--partition-plan'), resultsDir = options.get('--partition-results'), out = options.get('--out');
  if (!out || (receiptsDir ? planFile || resultsDir : !planFile || !resultsDir)) throw new Error('Use --out <directory> and either --receipts <directory> or --partition-plan <file> --partition-results <directory>.');
  const mode = options.get('--preview-mode'), base = options.get('--preview-base');
  if ((mode || base) && (!mode || !['web', 'validation', 'scanners', 'db', 'all'].includes(mode) || !base || !/^[a-f0-9]{40}$/.test(base))) throw new Error('Preview requires a recognized mode and an exact base SHA.');
  const start = performance.now();
  await checkReleasePrerequisites();
  const currentInputs = () => releaseInputs(process.cwd(), { portableDependencies: !!planFile });
  const initial = await currentInputs();
  if (!initial.clean) throw new Error('Preparation requires a clean committed source.');
  const [records, exportsFingerprint, response, preview, plan] = await Promise.all([
    metadata(receiptsDir ?? resultsDir!),
    workspaceExportsFingerprint(),
    exec('gh', ['api', `repos/ergoveritas1-alt/certscore.ai/actions/runs?head_sha=${initial.sha}&per_page=100`], { timeout: 15_000, maxBuffer: 4 * 1024 * 1024 }).catch(() => { throw new Error('Live CI metadata unavailable; credentials and response omitted.'); }),
    mode && base ? Promise.all([
      checkReleasePrerequisites({ deployment: true, scanner: mode === 'all' || mode === 'scanners' }),
      // Fixed read-only preview flags; the preparation command cannot dispatch.
      exec(process.execPath, ['scripts/release-node.mjs', 'scripts/deploy-fast.ts', mode, '--base', base, '--plan', '--no-push',
        ...(mode === 'all' || mode === 'scanners' ? ['--preserve-scanner-operational-settings'] : [])], { timeout: 12_000, maxBuffer: 1024 * 1024 }),
    ]).then(([, plan]) => ({ mode, base, plan: plan.stdout })) : undefined,
    planFile ? readPlan(planFile) : undefined,
  ]);
  const ci = JSON.parse(response.stdout) as { workflow_runs: CiRun[]; total_count: number };
  if (!Array.isArray(ci.workflow_runs) || ci.total_count > 100) throw new Error('CI inventory incomplete.');
  const checks = getPredeployPlan([], { full: true }).checks;
  if (planFile && !plan) throw new Error('Partition plan is missing.');
  const proof = plan ? validatePartitionPreparation(checks, initial, shardExecutionContext(), plan, records as ShardResult[], exportsFingerprint, ci.workflow_runs)
    : validatePreparation(checks, initial, records, exportsFingerprint, ci.workflow_runs);
  await exec(process.execPath, ['scripts/release-node.mjs', 'scripts/check-regional-web-bot-auth.ts', '--check-imports'], { timeout: 5000, maxBuffer: 1024 * 1024 });
  if (JSON.stringify(await currentInputs()) !== JSON.stringify(initial)) throw new Error('Preparation inputs changed.');
  const wallMs = Math.round(performance.now() - start);
  if (wallMs > 30_000) throw new Error('Preparation exceeded the 30-second target; readiness snapshot was not issued.');
  await mkdir(out, { recursive: true });
  const file = path.join(out, `preparation-${randomUUID()}.json`);
  await writeFile(file, `${JSON.stringify({ ...proof, wallMs, preview }, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
  console.log(JSON.stringify({ sha: initial.sha, checks: proof.checks.length, successfulCiWorkflows: proof.ci.length, wallMs, file }));
}
main().catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
