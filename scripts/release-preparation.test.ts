import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { workspaceExportsFingerprint, planReleaseBootstrap } from './lib/release-bootstrap';
import { getPredeployPlan } from './predeploy';
import { assertReleaseToolchain } from './lib/release-prerequisites';

test('full and fast plans bootstrap once before any dependent check and isolate browser groups', () => {
  for (const options of [{ full: true }, { allTargets: true }, {}]) {
    const plan = getPredeployPlan(['scripts/predeploy.ts'], options);
    assert.equal(plan.checks[0]?.key, 'workspace-package-build');
    assert.equal(plan.checks.filter(check => check.key === 'workspace-package-build').length, 1);
  }
  for (const node of ['v20.0.0', 'v25.0.0', 'invalid']) assert.throws(() => assertReleaseToolchain(node, '10.6.3', 'pnpm@10.6.3'));
  assert.throws(() => assertReleaseToolchain('v22.22.1', '10.7.0', 'pnpm@10.6.3'));
  assert.doesNotThrow(() => assertReleaseToolchain('v24.0.0', '10.6.3', 'pnpm@10.6.3'));
});
test('verification entry resolves workspace imports without an inherited TypeScript workaround or AWS invocation', () => {
  const env = { ...process.env }; delete env.TSX_TSCONFIG_PATH;
  env.AWS_EC2_METADATA_DISABLED = 'true';
  const result = spawnSync(process.execPath, ['scripts/release-node.mjs', 'scripts/check-regional-web-bot-auth.ts', '--check-imports'], { encoding: 'utf8', env, timeout: 15_000 });
  assert.equal(result.status, 0, result.stderr); assert.match(result.stdout, /no AWS calls/);
});
test('compiler cache restoration excludes stale build output, typecheck state and build identity', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'compiler-cache-'));
  try {
    const source = path.join(root, 'source'), destination = path.join(root, 'destination');
    await mkdir(path.join(source, 'webpack'), { recursive: true }); await mkdir(destination);
    await writeFile(path.join(source, 'webpack', 'cache.pack'), 'compiler-cache');
    for (const file of ['BUILD_ID', 'tsconfig.tsbuildinfo', 'routes-manifest.json']) await writeFile(path.join(source, file), 'old-release');
    await writeFile(path.join(destination, 'BUILD_ID'), 'stale');
    const result = spawnSync(process.execPath, ['scripts/web-compiler-cache.mjs', source, destination], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(await readFile(path.join(destination, 'webpack', 'cache.pack'), 'utf8'), 'compiler-cache');
    for (const file of ['BUILD_ID', 'tsconfig.tsbuildinfo', 'routes-manifest.json']) await assert.rejects(readFile(path.join(destination, file)));
  } finally { await rm(root, { recursive: true, force: true }); }
});
test('independent CI gates both precede image/migration promotion and exact-SHA typecheck output remains required', async () => {
  const source = await readFile('.github/workflows/web-aws-ecs-deploy.yml', 'utf8');
  assert.match(source, /needs: \[verify-public-web, verify-post-accept-forms\]/);
  const checks = source.slice(source.indexOf('  verify-public-web:'), source.indexOf('  verify-post-accept-forms:'));
  assert.match(checks, /verified_sha: \$\{\{ steps.web-typecheck.outputs.verified_sha \}\}/);
  assert.ok(checks.indexOf('/web typecheck') < checks.indexOf('echo "verified_sha='));
  assert.match(source, /WEB_TYPECHECK_VERIFIED_SHA="\$\{\{ needs.verify-public-web.outputs.verified_sha \}\}"/);
  assert.ok(source.indexOf('Apply database migrations from target web image') < source.indexOf('Force ECS deployments'));
  assert.match(source, /aws ecs wait services-stable/);
  const docker = await readFile('apps/web/Dockerfile', 'utf8');
  assert.ok(docker.indexOf('RUN rm -rf ./apps/web/.next') < docker.indexOf('COPY --from=web-compiler-cache-input'));
  assert.match(docker, /BUILD_GIT_SHA/);
});

test('bootstrap compiles shared exports once and fails before dropping unknown build work', () => {
  const packages = [
    { directory: 'packages/a', manifest: { name: 'a', scripts: { build: 'tsc -p tsconfig.json' } } },
    { directory: 'packages/b', manifest: { name: 'b', scripts: { build: 'pnpm --filter a build && tsc -p tsconfig.json' } } },
  ];
  const plan = planReleaseBootstrap(packages);
  assert.deepEqual(plan.map(value => value.commands), [[['tsc', '-p', 'tsconfig.json']], [['tsc', '-p', 'tsconfig.json']]]);
  assert.deepEqual(plan[1]?.dependencies, ['a']);
  assert.throws(() => planReleaseBootstrap([{ directory: 'packages/x', manifest: { name: 'x', scripts: { build: 'generate-assets && tsc -p tsconfig.json' } } }]), /Unreviewed/);
  assert.throws(() => planReleaseBootstrap([{ directory: 'packages/x', manifest: { name: 'x', scripts: { build: 'tsc -p tsconfig.json', prebuild: 'generate-assets' } } }]), /lifecycle/);
});

test('bootstrap output binding detects stale or missing exports even at the same source SHA', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'bootstrap-outputs-'));
  try {
    await mkdir(path.join(root, 'packages/fixture/dist'), { recursive: true });
    await writeFile(path.join(root, 'packages/fixture/package.json'), JSON.stringify({ name: 'fixture', exports: { '.': './dist/index.js' } }));
    const file = path.join(root, 'packages/fixture/dist/index.js');
    await writeFile(file, 'export const value = 1;');
    const first = await workspaceExportsFingerprint(root);
    await writeFile(file, 'export const value = 2;');
    assert.notEqual(await workspaceExportsFingerprint(root), first);
    await rm(file);
    await assert.rejects(workspaceExportsFingerprint(root));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('forced or drifted service deployment cannot collapse into an empty preflight', () => {
  for (const target of ['web', 'validation-worker', 'v2-dag-lambda', 'db']) {
    const plan = getPredeployPlan([], { targetKeys: [target] });
    assert.equal(plan.checks[0]?.key, 'workspace-package-build');
    assert.ok(plan.targets.includes(target)); assert.ok(plan.checks.length > 2);
  }
  assert.throws(() => getPredeployPlan([], { targetKeys: ['unknown'] }), /Unknown preflight target/);
});

test('automatic ECS workflows preserve compatibility checks while guarding every promotion step', async () => {
  for (const [file, start, build] of [
    ['mcp-aws-ecs-deploy.yml', 'Select deployment from installed MCP runtime inputs', 'Build and push immutable MCP image'],
    ['validation-aws-deploy.yml', 'Select deployment from installed validation runtime inputs', 'Build and push validation worker image'],
  ]) {
    const workflow = await readFile(`.github/workflows/${file}`, 'utf8');
    const selected = workflow.indexOf(`      - name: ${start}`);
    assert.ok(selected > workflow.indexOf('Install dependencies'));
    assert.ok(selected < workflow.indexOf(`      - name: ${build}`));
    const mutationSteps = workflow.slice(selected).split(/(?=      - name:)/).filter(value => /(?:aws ecs update-service|register-task-definition|docker buildx build)/.test(value));
    assert.ok(mutationSteps.length > 0);
    for (const step of mutationSteps) assert.match(step, /if:.*steps.runtime-selection.outputs.deploy == 'true'/);
  }
});
