import { readdir, readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { planReleaseBootstrap } from './lib/release-bootstrap';
import { scheduleReleaseTasks } from './lib/release-scheduler';
async function main() {
  const started = performance.now();
  const packages = [];
  for (const directory of await readdir('packages')) {
    try { packages.push({ directory: `packages/${directory}`, manifest: JSON.parse(await readFile(`packages/${directory}/package.json`, 'utf8')) }); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  }
  const plan = planReleaseBootstrap(packages);
  console.log(`Bootstrap: ${plan.length} packages, each compiler/export command once; two lanes, 8 GiB shared cap.`);
  const timings = await scheduleReleaseTasks(plan.map(value => ({ ...value, exclusive: false, memoryMb: 4096,
    run: async () => {
      for (const command of value.commands) await new Promise<void>((resolve, reject) => {
        const child = spawn('pnpm', ['exec', ...command], { cwd: value.directory, stdio: 'inherit' });
        child.on('error', reject);
        child.on('exit', code => code === 0 ? resolve() : reject(new Error(`Bootstrap failed for ${value.key} (${code ?? 'signal'}).`)));
      });
    },
  })), { lanes: 2, memoryMb: 8192 });
  console.log(JSON.stringify({ bootstrapWallMs: Math.round(performance.now() - started), taskTotalMs: Math.round(timings.reduce((sum, value) => sum + value.durationMs, 0)), packages: plan.length }));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
