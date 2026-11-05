/** Owned local fixture benchmark. These timings are not a production-build claim. */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
const root = process.cwd(), fixture = await mkdtemp(path.join(tmpdir(), 'certscore-compiler-benchmark-'));
const receiptPath = process.argv[2] ?? path.join(tmpdir(), 'certscore-compiler-benchmark.json');
const inputFiles = ['scripts/benchmark-web-compiler-cache.mjs', 'scripts/web-compiler-cache.mjs', 'pnpm-lock.yaml', 'node_modules/next/package.json'];
const inputFingerprints = Object.fromEntries(await Promise.all(inputFiles.map(async file => [file, createHash('sha256').update(await readFile(file)).digest('hex')])));
try {
  await symlink(path.join(root, 'node_modules'), path.join(fixture, 'node_modules'));
  await mkdir(path.join(fixture, 'app'));
  await writeFile(path.join(fixture, 'package.json'), JSON.stringify({ name: 'certscore-owned-build-fixture', private: true, dependencies: { next: '15.5.9', react: '19', 'react-dom': '19' } }));
  await writeFile(path.join(fixture, 'next.config.mjs'), `export default {deploymentId: process.env.BUILD_GIT_SHA, generateBuildId: async () => process.env.BUILD_GIT_SHA, experimental: {cpus: 2}};\n`);
  await writeFile(path.join(fixture, 'app/layout.js'), 'export default function Layout({children}) {return <html lang="en"><body>{children}</body></html>}');
  await writeFile(path.join(fixture, 'app/page.js'), 'export default function Page() {return <main><h1>CertScore.ai owned compiler fixture</h1></main>}');
  const results = [];
  for (const [label, sha] of [['cold', 'a'.repeat(40)], ['restored', 'b'.repeat(40)]]) {
    const start = performance.now();
    const log = execFileSync(process.execPath, [path.join(root, 'node_modules/next/dist/bin/next'), 'build', fixture], { cwd: fixture,
      env: { PATH: process.env.PATH, HOME: process.env.HOME, NODE_ENV: 'production', NEXT_TELEMETRY_DISABLED: '1', BUILD_GIT_SHA: sha, NODE_OPTIONS: '--max-old-space-size=8192' },
      encoding: 'utf8', timeout: 180_000, maxBuffer: 8 * 1024 * 1024 });
    const wallMs = performance.now() - start;
    await writeFile(`${receiptPath}.${label}.log`, log);
    const buildId = (await readFile(path.join(fixture, '.next/BUILD_ID'), 'utf8')).trim();
    if (buildId !== sha) throw new Error('Fresh build identity mismatch.');
    results.push({ label, wallMs: Math.round(wallMs), buildId });
    if (label === 'cold') {
      execFileSync(process.execPath, [path.join(root, 'scripts/web-compiler-cache.mjs'), path.join(fixture, '.next/cache'), path.join(fixture, 'saved-cache')]);
      await rm(path.join(fixture, '.next'), { recursive: true, force: true });
      const restoreStart = performance.now();
      execFileSync(process.execPath, [path.join(root, 'scripts/web-compiler-cache.mjs'), path.join(fixture, 'saved-cache'), path.join(fixture, '.next/cache')]);
      results[0].restoreMs = Math.round(performance.now() - restoreStart);
    }
  }
  const receipt = { scope: 'owned minimal Next.js fixture; no production build/deployment or public scan',
    sourceSha: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    sourceDirty: Boolean(execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim()), inputFingerprints,
    command: [process.execPath, 'node_modules/next/dist/bin/next', 'build', '<owned-temporary-fixture>'], node: process.version,
    next: JSON.parse(await readFile('node_modules/next/package.json', 'utf8')).version,
    completedAt: new Date().toISOString(), results };
  await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
  console.log(JSON.stringify(receipt, null, 2));
} finally { await rm(fixture, { recursive: true, force: true }); }
