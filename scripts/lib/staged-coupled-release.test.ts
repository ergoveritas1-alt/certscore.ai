import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { assertStagedCoupledRelease, type StagedCoupledRelease } from './staged-coupled-release';
import { stagedEcsImage } from './staged-ecs-image.mjs';
import { SCANNER_PROVENANCE_REGIONS } from './scanner-image-provenance';

const sha = 'a'.repeat(40), baseSha = 'b'.repeat(40), digest = `sha256:${'c'.repeat(64)}`;
const now = Date.parse('2026-11-05T08:00:00.000Z');
const stagedAt = new Date(now - 1000).toISOString();
const repository = 'ergoveritas1-alt/certscore.ai';
const imageRepository = '199536052647.dkr.ecr.us-west-1.amazonaws.com/certscore-web';
const runId = '11111', attempt = '2';
const scannerSettings = Object.fromEntries(SCANNER_PROVENANCE_REGIONS.flatMap(region =>
  ['certscore-v2-dag-local-lambda', 'certscore-v2-dag-local-lambda-inventory'].map((name, index) =>
    [`${region}/${name}`, { memoryMb: 3008, timeoutSeconds: index ? 25 : 90, environmentSha256: 'd'.repeat(64) }])));
const staged: StagedCoupledRelease = {
  version: 1, sha, baseSha, stagedAt, webRunId: runId, webImage: `${attempt}:${digest}`, scannerSettings,
  scanner: { sha, runtimeBase: 'reused', images: Object.fromEntries(SCANNER_PROVENANCE_REGIONS.map(region =>
    [region, `199536052647.dkr.ecr.${region}.amazonaws.com/certscore-v2-dag-local-lambda@${digest}`])) },
};

test('the coupled receipt binds a warm release to the exact target, live base, and all six scanner settings', () => {
  assert.doesNotThrow(() => assertStagedCoupledRelease(staged, sha, baseSha, now));
  for (const changed of [
    { sha: baseSha }, { baseSha: sha }, { webRunId: '../x' }, { webImage: '1:latest' },
    { stagedAt: new Date(now + 1000).toISOString() }, { stagedAt: '2026-11-01T00:00:00Z' },
    { scanner: { ...staged.scanner, runtimeBase: 'rebuilt' as const } }, { scannerSettings: {} },
  ]) assert.throws(() => assertStagedCoupledRelease({ ...staged, ...changed }, sha, baseSha, now), /Staged release/);
});

test('only a successful, exact-SHA staging attempt can supply the web digest', () => {
  const expected = { kind: "web", sha, runId, repository, imageRepository, now };
  const receipt = { version: 1, sha, typecheckedSha: sha, runId, attempt, repository: imageRepository, digest };
  const run = {
    id: Number(runId), run_attempt: Number(attempt), head_sha: sha, head_branch: 'main',
    path: '.github/workflows/web-aws-ecs-deploy.yml', event: 'workflow_dispatch', status: 'completed', conclusion: 'success',
    display_title: `Stage public web ${sha}`, updated_at: stagedAt,
    repository: { full_name: repository }, head_repository: { full_name: repository },
  };
  assert.equal(stagedEcsImage(run, receipt, expected), `${imageRepository}@${digest}`);
  for (const changed of [
    { head_sha: baseSha }, { event: 'push' }, { status: 'in_progress' }, { conclusion: 'failure' },
    { display_title: `Deploy public web ${sha}` }, { head_branch: 'feature' }, { updated_at: '2026-11-01T00:00:00Z' },
    { path: '.github/workflows/unrelated.yml' }, { head_repository: { full_name: 'someone/else' } },
  ]) assert.throws(() => stagedEcsImage({ ...run, ...changed }, receipt, expected), /successful web staging run/);
  for (const changed of [{ attempt: '1' }, { typecheckedSha: baseSha }, { digest: 'latest' }, { repository: 'other' }]) {
    assert.throws(() => stagedEcsImage(run, { ...receipt, ...changed }, expected), /does not match/);
  }
});

test('validation staging cannot be substituted by a web run and requires its own image binding', () => {
  const validation = { runId, image: `${attempt}:${digest}` };
  assert.doesNotThrow(() => assertStagedCoupledRelease({ ...staged, validation }, sha, baseSha, now));
  assert.throws(() => assertStagedCoupledRelease({ ...staged, validation: { ...validation, image: '2:latest' } }, sha, baseSha, now));
  const expected = { kind: 'validation', sha, runId, repository, imageRepository, now };
  const receipt = { version: 1, sha, typecheckedSha: sha, runId, attempt, repository: imageRepository, digest };
  const run = {
    id: Number(runId), run_attempt: Number(attempt), head_sha: sha, head_branch: 'main',
    path: '.github/workflows/validation-aws-deploy.yml', event: 'workflow_dispatch', status: 'completed', conclusion: 'success',
    display_title: `Stage validation ${sha}`, updated_at: stagedAt,
    repository: { full_name: repository }, head_repository: { full_name: repository },
  };
  assert.equal(stagedEcsImage(run, receipt, expected), `${imageRepository}@${digest}`);
  assert.throws(() => stagedEcsImage({ ...run, path: '.github/workflows/web-aws-ecs-deploy.yml' }, receipt, expected));
});

test('validation stages all existing checks and keeps ECS writes and boot checks behind promotion', async () => {
  const workflow = await readFile('.github/workflows/validation-aws-deploy.yml', 'utf8');
  const step = (name: string) => workflow.split(/(?=      - name:)/).find(value => value.startsWith(`      - name: ${name}\n`)) ?? '';
  for (const name of ['Verify post-Accept forms and images reach the report', 'Typecheck validation worker', 'Run validation pipeline tests']) {
    assert.match(step(name), /if: inputs.staged_run_id == ''/);
    assert.ok(workflow.indexOf(name) < workflow.indexOf('Build and push validation worker image'));
  }
  for (const name of ['Register validation worker task definition', 'Force ECS deployments', 'Wait for ECS services to stabilize', 'Check validation worker ECS boot']) {
    assert.match(step(name), /if:.*!inputs.stage_only/);
  }
  assert.ok(workflow.indexOf('Verify and select staged validation image') < workflow.indexOf('Register validation worker task definition'));
});

test('offline staged rehearsal preserves exact migration, ECS and scanner promotion ordering', async () => {
  const { deployConsumersBeforeProducer } = await import('./deployment-consumer-barrier');
  const { runScannerPromotions } = await import('./scanner-artifact');
  const { waitForEcsMigration } = await import('../wait-for-ecs-migration.mjs');
  const { waitForStagedEcs } = await import('../wait-for-staged-ecs.mjs');
  const { synchronizeScannerImage } = await import('./scanner-image-provenance');
  assertStagedCoupledRelease(staged, sha, baseSha, now);
  for (const rollback of [false, true]) {
    const transitions: string[] = [];
    const service = async (name: string) => {
      const task = `${name}:2`;
      await waitForStagedEcs([{ name, task }], async () => ({ services: [{
        serviceName: name, taskDefinition: task, status: 'ACTIVE', desiredCount: 1, runningCount: 1, pendingCount: 0,
        deployments: [{ status: 'PRIMARY', taskDefinition: task, runningCount: 1,
          rolloutState: name === 'validation' && rollback ? 'FAILED' : 'COMPLETED' }],
      }] }), { report() {} });
      transitions.push(name);
      return { status: 'succeeded' };
    };
    const result = await deployConsumersBeforeProducer({
      consumers: [async () => {
        await waitForEcsMigration({ arn: 'migration', definition: 'web:2', container: 'web' }, async () => ({
          tasks: [{ taskArn: 'migration', taskDefinitionArn: 'web:2', lastStatus: 'STOPPED', containers: [{ name: 'web', exitCode: 0 }] }],
        }), { report() {} });
        transitions.push('migration');
        return service('web');
      }, () => service('validation').catch(() => ({ status: 'failed' }))],
      async producer() {
        assert.deepEqual([...transitions].sort(), ['migration', 'validation', 'web']);
        await runScannerPromotions(async (region, inventory) => {
          const image = staged.scanner.images[region]!;
          let imageUri = image.replace(digest, `sha256:${'a'.repeat(64)}`);
          let variables = { SCANNER_IMAGE_DIGEST: imageUri.split('@')[1]! };
          let rev = 0;
          await synchronizeScannerImage({
            async read() { return { imageUri, variables, revisionId: String(rev), state: 'Active', updateStatus: 'Successful' }; },
            async environment(next, revision) { assert.equal(revision, String(rev++)); variables = next as typeof variables; },
            async code(next, revision) { assert.equal(revision, String(rev++)); imageUri = next; },
            async wait() {},
          }, image, true);
          transitions.push(`${region}/${inventory ? 'inventory' : 'primary'}`);
        }, true);
        return { status: 'succeeded' };
      },
      skippedProducer: () => ({ status: 'skipped' }),
    });
    assert.ok(transitions.indexOf('migration') < transitions.indexOf('web'));
    assert.equal(transitions.filter(value => value.includes('/')).length, rollback ? 0 : 6);
    assert.equal(result.at(-1)?.status, rollback ? 'skipped' : 'succeeded');
  }
});
