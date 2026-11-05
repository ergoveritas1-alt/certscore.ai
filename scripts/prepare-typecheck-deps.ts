import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { verifiedTypecheckExportsEnv } from './lib/release-suite-reuse';

const [application] = process.argv.slice(2);
const dependencies = application === 'web' ? ['--filter', '@certscore/mcp-auth', 'build']
  : application === 'mcp' ? ['run', 'build:deps'] : null;
if (!dependencies) throw new Error('Specify web or mcp typecheck dependencies.');

async function reviewedMcpBuild() {
  const { scripts } = JSON.parse(await readFile(new URL('../apps/mcp/package.json', import.meta.url), 'utf8'));
  const packages = ['@certscore/contracts', '@website-signal-risk-scanner/shared', '@certscore/api-contracts',
    '@certscore/sdk', '@certscore/mcp-auth', '@certscore/mcp'];
  return !scripts['prebuild:deps'] && !scripts['postbuild:deps'] &&
    scripts['build:deps'] === packages.map(name => `pnpm --filter ${name} build`).join(' && ');
}

async function main(buildArgs: string[]) {
  const expected = process.env[verifiedTypecheckExportsEnv];
  if (expected && /^[a-f0-9]{64}$/.test(expected) &&
      (application !== 'mcp' || await reviewedMcpBuild())) {
    const root = fileURLToPath(new URL('../', import.meta.url));
    const { workspaceExportsFingerprint } = await import('./lib/release-bootstrap');
    if (await workspaceExportsFingerprint(root).catch(() => undefined) === expected) {
      console.log('Using verified workspace exports for typecheck.');
      return;
    }
  }
  const result = spawnSync('pnpm', buildArgs, { stdio: 'inherit', shell: process.platform === 'win32' });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}

main(dependencies).catch(error => { console.error(error); process.exitCode = 1; });
