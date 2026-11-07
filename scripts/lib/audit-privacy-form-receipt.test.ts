import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import {
  PRIVACY_FORM_RECEIPT_FIELDS, PRIVACY_FORM_RECEIPT_MAX_BYTES, PRIVACY_FORM_RECEIPT_VERSION, readPrivacyFormAuditReceipt,
} from './audit-privacy-form-receipt';

const binding = {
  scanId: '11111111-1111-4111-8111-111111111111', createdAt: '2026-11-06T08:01:00.123456+00:00',
  generation: 'scan-report-projection-v27', projectionSourceHash: 'a'.repeat(64), projectionPayloadSha256: 'b'.repeat(64),
  originalRequestId: 'pulse_req_fixture', originalBundleSha256: 'c'.repeat(64),
  originalManifestSha256: 'd'.repeat(64), persistedSourceSha256: 'e'.repeat(64),
};
const row = {
  scanId: binding.scanId, createdAt: binding.createdAt, reportable: true, projectionVersion: binding.generation,
  publicProjectionSourceHash: binding.projectionSourceHash, originProof: 'original_credential_verified',
  originRequestId: binding.originalRequestId,
};
function receipt() {
  return {
    version: PRIVACY_FORM_RECEIPT_VERSION, binding: { ...binding },
    california: {
      assessment: { status: 'available', policy: 'california-privacy-review.v10', facets: { choiceSurface: ['unknown'] } },
      coverage: { status: 'available', policy: 'california-review-coverage.v4', facets: { 'family.california_rights.status': ['review'] } },
      rights: { status: 'not_retained' },
      collectionNotice: { status: 'available', policy: 'california-collection-notice-matching.v5', facets: { 'point.status': ['limited'] } },
      saleSharing: { status: 'invalid_or_unbound' },
    },
    initialPassiveForms: {
      status: 'assessment_retained', contractVersion: 'certscore.collection-surface-assessment.v1',
      sourceInventoryContractVersion: 'certscore.collection-surface-inventory.v1', inventorySha256: 'f'.repeat(64),
      assessmentStatus: 'not_observed', limitationKeys: [],
      coverage: {
        status: 'complete', documentScope: 'main_document', interactionMode: 'none',
        candidateFormCount: 0, retainedFormCount: 0, candidateFieldCount: 0, retainedFieldCount: 0,
        inspectedFormCandidateCount: 0, inspectedFieldCandidateCount: 0,
        candidateScanTruncated: false, retentionTruncated: false, reasonCodes: [],
      },
      forms: [],
    },
  };
}
const reference = (bytes: Uint8Array) => ({
  bytes: bytes.byteLength, sha256: createHash('sha256').update(bytes).digest('hex'), binding,
});
function decode(value: ReturnType<typeof receipt>) {
  const bytes = Buffer.from(JSON.stringify(value));
  return readPrivacyFormAuditReceipt(bytes, reference(bytes), row);
}

test('receipt reader rejects damaged bytes, oversized input, and current scan binding drift', () => {
  const bytes = Buffer.from(JSON.stringify(receipt()));
  const trusted = reference(bytes);
  assert.throws(() => readPrivacyFormAuditReceipt(Buffer.alloc(bytes.length), trusted, row), /checksum/);
  assert.throws(() => readPrivacyFormAuditReceipt(Buffer.alloc(PRIVACY_FORM_RECEIPT_MAX_BYTES + 1), trusted, row), /byte cap/);
  for (const drift of [
    { scanId: '22222222-2222-4222-8222-222222222222' }, { createdAt: binding.createdAt.replace('123456', '123457') },
    { projectionVersion: 'different' }, { publicProjectionSourceHash: 'f'.repeat(64) },
    { originRequestId: 'pulse_req_other' }, { originProof: 'archive_only' }, { reportable: false },
  ]) {
    assert.throws(() => readPrivacyFormAuditReceipt(bytes, trusted, { ...row, ...drift }), /binding/);
  }
  for (const drift of [{ originalBundleSha256: 'f'.repeat(64) }, { projectionPayloadSha256: 'f'.repeat(64) }]) {
    assert.throws(() => readPrivacyFormAuditReceipt(bytes, { ...trusted, binding: { ...binding, ...drift } }, row), /binding/);
  }
});

test('verified empty form inventory is distinct from missing, limited, and inconsistent evidence', () => {
  const value = receipt();
  const decoded = decode(value);
  assert.deepEqual(decoded.fields.map(field => field.legacyId), PRIVACY_FORM_RECEIPT_FIELDS);
  assert.ok(decoded.fields.filter(field => field.legacyId.startsWith('collection.'))
    .every(field => field.samples[0]?.availability === 'empty_inventory'));
  assert.equal(decoded.fields.find(field => field.legacyId === 'privacy.rights.assessment')?.status, 'not_retained');
  assert.equal(decoded.fields.find(field => field.legacyId === 'privacy.sale_sharing.assessment')?.status, 'invalid_or_unbound');
  value.initialPassiveForms.coverage.candidateScanTruncated = true;
  assert.ok(decode(value).fields.filter(field => field.legacyId.startsWith('collection.')).every(field => field.samples.length === 0));
  value.initialPassiveForms.coverage.retainedFieldCount = 1;
  assert.throws(() => decode(value), /Inconsistent retained form records/);
});

test('strict receipt schema rejects raw policy content and an unrecognized form phase', () => {
  const withPolicyText = receipt();
  Object.assign(withPolicyText.california.assessment, { policyText: 'raw content' });
  assert.throws(() => decode(withPolicyText));
  const wrongScope = receipt();
  wrongScope.initialPassiveForms.coverage.interactionMode = 'after_accept';
  assert.throws(() => decode(wrongScope));
});
