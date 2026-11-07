import { readdir, readFile, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { resolve as absolutePath } from 'node:path';
import { planReleaseBootstrap, workspaceExportsFingerprint } from './lib/release-bootstrap';
import { scheduleReleaseTasks } from './lib/release-scheduler';
import { nextBuildPhases } from './lib/next-build-phases';
async function main() {
  const started = performance.now();
  const [mode, ...extra] = process.argv.slice(2);
  if (extra.length || (mode && mode !== '--workspace')) throw new Error('Use --workspace for the full workspace build.');
  const fullWorkspace = mode === '--workspace';
  const packages = [];
  for (const root of fullWorkspace ? ['packages', 'apps'] : ['packages']) {
    for (const entry of await readdir(root)) {
      const directory = `${root}/${entry}`;
      try { packages.push({ directory, manifest: JSON.parse(await readFile(`${directory}/package.json`, 'utf8')) }); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    }
  }
  const plan = planReleaseBootstrap(packages, fullWorkspace);
  const reuse = process.env.CERTSCORE_VERIFIED_PACKAGE_EXPORTS;
  let pending = plan;
  if (reuse !== undefined) {
    const packagePlan = plan.filter(task => task.directory.startsWith('packages/'));
    const bootstrapPlan = planReleaseBootstrap(packages.filter(value => value.directory.startsWith('packages/')));
    if (!fullWorkspace || process.env.CERTSCORE_VERIFICATION_COLD_BUILD !== '1' ||
        JSON.stringify(packagePlan) !== JSON.stringify(bootstrapPlan) || reuse !== await workspaceExportsFingerprint()) {
      throw new Error('Workspace build requires the verified exports and matching package build graph.');
    }
    const completed = new Set(packagePlan.map(task => task.key));
    pending = plan.filter(task => !completed.has(task.key)).map(task => ({
      ...task, dependencies: task.dependencies.filter(dependency => !completed.has(dependency)),
    }));
  }
  console.log(`${fullWorkspace ? 'Workspace build' : 'Bootstrap'}: ${pending.length} tasks; two lanes, 8 GiB shared cap.`);
  const timings = await scheduleReleaseTasks(pending.map(value => ({
    ...value, exclusive: value.directory === 'apps/web', memoryMb: value.directory === 'apps/web' ? 8192 : 4096,
    run: async () => {
      console.log(`Building ${value.key}`);
      for (const command of value.commands) await new Promise<void>((resolve, reject) => {
        const isTypeScript = command[0] === 'tsc';
        const args = isTypeScript ? [createRequire(absolutePath(value.directory, 'package.json')).resolve('typescript/bin/tsc'), ...command.slice(1)]
          : command[0] === 'pnpm' ? command.slice(1) : ['exec', ...command];
        const env = command[0] === 'next'
          ? { ...process.env, NODE_OPTIONS: process.env.NODE_OPTIONS || '--max-old-space-size=8192',
              ...(process.env.CERTSCORE_VERIFICATION_COLD_BUILD === '1' ? { CERTSCORE_COLD_WEB_BUILD: '1' } : {}) }
          : process.env;
        const child = spawn(isTypeScript ? process.execPath : 'pnpm', args, { cwd: value.directory, env, stdio: 'inherit' });
        child.on('error', reject);
        child.on('exit', code => code === 0 ? resolve() : reject(new Error(`Bootstrap failed for ${value.key} (${code ?? 'signal'}).`)));
      });
    },
  })), { lanes: 2, memoryMb: 8192 });
  const wallMs = Math.round(performance.now() - started);
  if (fullWorkspace) {
    const timingFile = process.env.CERTSCORE_WORKSPACE_BUILD_TIMING_FILE;
    const webPhases = timingFile ? await nextBuildPhases('apps/web/.next/trace').catch(() => {
      console.warn('Next build phase trace is unavailable; workspace timing remains available.');
      return undefined;
    }) : undefined;
    const summary = JSON.stringify({ workspaceBuildWallMs: wallMs, reusedPackageTasks: plan.length - pending.length, tasks: timings, webPhases });
    console.log(summary);
    if (timingFile) await writeFile(timingFile, `${summary}\n`, { flag: 'wx', mode: 0o600 }).catch(() => {
      console.warn('Workspace build phase timing could not be written; total timing remains in the check receipt.');
    });
  } else {
    console.log(JSON.stringify({ bootstrapWallMs: wallMs, taskTotalMs: Math.round(timings.reduce((sum, value) => sum + value.durationMs, 0)), packages: plan.length }));
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
