import assert from 'node:assert/strict';
import test from 'node:test';
import { assertStagedCoupledRelease, type StagedCoupledRelease } from './staged-coupled-release';
import { stagedWebImage } from './staged-web-image.mjs';
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
  const expected = { sha, runId, repository, imageRepository, now };
  const receipt = { version: 1, sha, typecheckedSha: sha, runId, attempt, repository: imageRepository, digest };
  const run = {
    id: Number(runId), run_attempt: Number(attempt), head_sha: sha, head_branch: 'main',
    path: '.github/workflows/web-aws-ecs-deploy.yml', event: 'workflow_dispatch', status: 'completed', conclusion: 'success',
    display_title: `Stage public web ${sha}`, updated_at: stagedAt,
    repository: { full_name: repository }, head_repository: { full_name: repository },
  };
  assert.equal(stagedWebImage(run, receipt, expected), `${imageRepository}@${digest}`);
  for (const changed of [
    { head_sha: baseSha }, { event: 'push' }, { status: 'in_progress' }, { conclusion: 'failure' },
    { display_title: `Deploy public web ${sha}` }, { head_branch: 'feature' }, { updated_at: '2026-11-01T00:00:00Z' },
    { path: '.github/workflows/unrelated.yml' }, { head_repository: { full_name: 'someone/else' } },
  ]) assert.throws(() => stagedWebImage({ ...run, ...changed }, receipt, expected), /successful web staging run/);
  for (const changed of [{ attempt: '1' }, { typecheckedSha: baseSha }, { digest: 'latest' }, { repository: 'other' }]) {
    assert.throws(() => stagedWebImage(run, { ...receipt, ...changed }, expected), /does not match/);
  }
});
