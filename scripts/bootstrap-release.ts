import { readdir, readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { planReleaseBootstrap } from './lib/release-bootstrap';
import { scheduleReleaseTasks } from './lib/release-scheduler';
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
  console.log(`${fullWorkspace ? 'Workspace build' : 'Bootstrap'}: ${plan.length} tasks; two lanes, 8 GiB shared cap.`);
  const timings = await scheduleReleaseTasks(plan.map(value => ({
    ...value, exclusive: value.directory === 'apps/web', memoryMb: value.directory === 'apps/web' ? 8192 : 4096,
    run: async () => {
      console.log(`Building ${value.key}`);
      for (const command of value.commands) await new Promise<void>((resolve, reject) => {
        const args = command[0] === 'pnpm' ? command.slice(1) : ['exec', ...command];
        const env = command[0] === 'next'
          ? { ...process.env, NODE_OPTIONS: process.env.NODE_OPTIONS || '--max-old-space-size=8192' }
          : process.env;
        const child = spawn('pnpm', args, { cwd: value.directory, env, stdio: 'inherit' });
        child.on('error', reject);
        child.on('exit', code => code === 0 ? resolve() : reject(new Error(`Bootstrap failed for ${value.key} (${code ?? 'signal'}).`)));
      });
    },
  })), { lanes: 2, memoryMb: 8192 });
  const wallMs = Math.round(performance.now() - started);
  if (fullWorkspace) {
    console.log(JSON.stringify({ workspaceBuildWallMs: wallMs, tasks: timings }));
  } else {
    console.log(JSON.stringify({ bootstrapWallMs: wallMs, taskTotalMs: Math.round(timings.reduce((sum, value) => sum + value.durationMs, 0)), packages: plan.length }));
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
