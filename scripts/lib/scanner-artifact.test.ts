import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { assertScannerArtifactMetadata, assertScannerArtifact, type ScannerArtifact } from './scanner-artifact';
import { SCANNER_PROVENANCE_REGIONS } from './scanner-image-provenance';
import { deployConsumersWithPreparedProducer } from './deployment-consumer-barrier';
const sha = 'a'.repeat(40), digest = `sha256:${'b'.repeat(64)}`;
const artifact = (): ScannerArtifact => ({ sha, runtimeBase: 'reused', images: Object.fromEntries(SCANNER_PROVENANCE_REGIONS.map(region => [region, `199536052647.dkr.ecr.${region}.amazonaws.com/certscore-v2-dag-local-lambda@${digest}`])) });
test('scanner artifact binds exact SHA, approved regional inventory and digest parity', () => {
  assert.doesNotThrow(() => assertScannerArtifact(artifact(), sha));
  for (const change of ['sha', 'parity', 'region', 'missing'] as const) {
    const value = artifact();
    if (change === 'sha') value.sha = 'c'.repeat(40);
    if (change === 'parity') value.images['us-west-1'] = value.images['us-west-1']!.replace(digest, `sha256:${'c'.repeat(64)}`);
    if (change === 'region') value.images['us-west-1'] = value.images['eu-west-1']!;
    if (change === 'missing') delete value.images['us-west-1'];
    assert.throws(() => assertScannerArtifact(value, sha), /artifact/);
  }
});
test('every consumer failure blocks code, provenance and broad settings while preparation overlaps', async () => {
  for (const status of ['failed', 'pending', 'throw']) {
    const writes: string[] = [], events: string[] = [];
    let release!: () => void;
    const consumer = new Promise<void>(resolve => { release = resolve; });
    const work = deployConsumersWithPreparedProducer({ consumers: [async () => { events.push('web'); await consumer; return { status: 'succeeded' }; },
      async () => { if (status === 'throw') throw Error('monitor'); return { status }; }],
      prepareProducer: async () => { events.push('artifact'); return { status: 'succeeded' }; },
      producer: async () => { writes.push('configuration', 'clear-provenance', 'code', 'stamp-provenance', 'coverage'); return { status: 'succeeded' }; },
      skippedProducer: () => ({ status: 'skipped' }) });
    await Promise.resolve(); assert.deepEqual(events, ['web', 'artifact']); assert.deepEqual(writes, []); release();
    if (status === 'throw') await assert.rejects(work); else assert.equal((await work).at(-1)?.status, 'skipped');
    assert.deepEqual(writes, []);
  }
});
test('failed preparation blocks promotion even after both consumers succeed', async () => {
  let writes = 0;
  const result = await deployConsumersWithPreparedProducer({ consumers: [async () => ({ status: 'succeeded' })],
    prepareProducer: async () => ({ status: 'failed' }), producer: async () => { writes++; return { status: 'succeeded' }; }, skippedProducer: () => ({ status: 'skipped' }) });
  assert.equal(writes, 0); assert.equal(result.at(-1)?.status, 'skipped');
});
test('actual preparation function contains no Lambda writer; promotion contains all writer phases', async () => {
  const source = await readFile('scripts/deploy-fast.ts', 'utf8');
  const prepare = source.slice(source.indexOf('async function prepareScannerArtifact('), source.indexOf('async function promoteScannerArtifact('));
  assert.doesNotMatch(prepare, /configureScannerSettingsUnlessPreserved|applyScannerRuntimeConfiguration|synchronizeScannerImage|update-function/);
  const promote = source.slice(source.indexOf('async function promoteScannerArtifact('), source.indexOf('async function deployScanners('));
  for (const required of ['assertScannerArtifact', 'readScannerOperationalSettings', 'synchronizeScannerImage', 'applyScannerRuntimeConfiguration']) assert.ok(promote.includes(required));
  assert.ok(promote.indexOf('assertScannerArtifact') < promote.indexOf('synchronizeScannerImage'));
});

test('embedded image metadata must bind both build SHA and image tag', () => {
  assert.doesNotThrow(() => assertScannerArtifactMetadata([`BUILD_GIT_SHA=${sha}`, `BUILD_IMAGE_TAG=${sha}`], sha));
  for (const value of [null, {}, [], [`BUILD_GIT_SHA=${sha}`], [`BUILD_GIT_SHA=${'c'.repeat(40)}`, `BUILD_IMAGE_TAG=${sha}`]]) {
    assert.throws(() => assertScannerArtifactMetadata(value, sha), /metadata\/SHA mismatch/);
  }
});
