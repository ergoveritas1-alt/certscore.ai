/** Offline rehearsal from an existing local daily dashboard. Emits one example, never a daily input. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  buildLocalPrivacyFormAuditReceipts,
  PRIVACY_FORM_RECEIPT_FIELDS,
  PRIVACY_FORM_RECEIPT_MAX_BYTES,
  readPrivacyFormAuditReceipt,
  type PrivacyFormReceiptReference,
} from './lib/audit-privacy-form-receipt';
import { createP2Coverage } from './lib/audit-p2-coverage';
import type { PersistedP2Inputs } from './lib/audit-p2-persisted';
import snapshotLimits from './lib/audit-progress-snapshot-limits.json';

const [dashboard, output] = process.argv.slice(2);
if (!dashboard || !output || process.argv.length !== 4) {
  throw Error('Usage: prepare-audit-privacy-form-receipt.ts <local dashboard.json> <fresh output directory>');
}
const root = path.resolve(output);
if (existsSync(root)) throw Error('Fresh receipt output directory required');
const dashboardFile = realpathSync(dashboard);
const sealFile = path.join(path.dirname(dashboardFile), 'dashboard-seal.json');
if (statSync(dashboardFile).size > snapshotLimits['dashboard.json'] || statSync(sealFile).size > 100_000) {
  throw Error('Local dashboard or seal exceeds input bound');
}
const dashboardBytes = readFileSync(dashboardFile);
if (dashboardBytes.length > snapshotLimits['dashboard.json']) throw Error('Local dashboard exceeds input bound');
const dashboardSha256 = createHash('sha256').update(dashboardBytes).digest('hex');
const seal: { files: Array<{ file: string; bytes: number; sha256: string }> } = JSON.parse(readFileSync(sealFile, 'utf8'));
const sealedDashboard = seal.files.filter(entry => entry.file === dashboardFile);
assert.equal(sealedDashboard.length, 1, 'Local dashboard seal must identify the input');
assert.equal(sealedDashboard[0]?.sha256, dashboardSha256, 'Local dashboard seal hash mismatch');
assert.equal(sealedDashboard[0]?.bytes, dashboardBytes.length, 'Local dashboard seal size mismatch');
const data: PersistedP2Inputs = JSON.parse(dashboardBytes.toString('utf8'));
const coverage = createP2Coverage();
const fieldChecks = new Set<string>(PRIVACY_FORM_RECEIPT_FIELDS);
let receipts = 0;
let maximumBytes = 0;
let example: { bytes: Buffer; reference: PrivacyFormReceiptReference } | undefined;

for (const candidate of buildLocalPrivacyFormAuditReceipts(data)) {
  const decoded = readPrivacyFormAuditReceipt(candidate.bytes, candidate.reference, candidate.row);
  for (const field of decoded.fields) {
    const original = candidate.original.fields.find(value => value.legacyId === field.legacyId);
    assert.ok(original && fieldChecks.has(field.legacyId));
    // The receipt retains the existing audit facets for these five assessments.
    // Their full customer-view objects and excerpts stay in the original source.
    const samples = field.legacyId.startsWith('privacy.')
      ? original.samples.map(sample => ({ ...sample, value: {} }))
      : original.samples;
    assert.deepEqual(field, { ...original, samples }, 'Privacy/form audit value drift: ' + field.legacyId);
  }
  assert.equal(decoded.fields.length, fieldChecks.size);
  coverage.add(candidate.row, [], {}, decoded);
  receipts++;
  maximumBytes = Math.max(maximumBytes, candidate.bytes.length);
  if (!example && decoded.fields.every(field => field.samples.some(sample => sample.availability === 'available'))) {
    example = candidate;
  }
}

assert.ok(example, 'No verified local example has all seven available fields');
mkdirSync(root, { mode: 0o700 });
const file = path.join(root, 'privacy-form-receipt.json');
writeFileSync(file, example.bytes, { flag: 'wx', mode: 0o600 });
const summary = {
  status: 'passed',
  scope: 'Local replay of already retained bytes',
  inputDashboard: { file: dashboardFile, bytes: dashboardBytes.length, sha256: dashboardSha256 },
  candidateReceiptsChecked: receipts,
  exactFieldChecks: receipts * fieldChecks.size,
  maximumBytes,
  capBytes: PRIVACY_FORM_RECEIPT_MAX_BYTES,
  example: { file, ...example.reference },
  fields: coverage.finish().items.filter(item => fieldChecks.has(item.legacyId)).map(item => ({
    legacyId: item.legacyId, matchedSourceScans: item.eligibleScans,
    availableScans: item.availableScans, unavailableScans: item.unavailableScans, states: item.states,
  })),
};
writeFileSync(path.join(root, 'local-verification.json'), JSON.stringify(summary, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
console.log(JSON.stringify({ receipts, fieldChecks: summary.exactFieldChecks, maximumBytes, exampleBytes: example.bytes.length }));
