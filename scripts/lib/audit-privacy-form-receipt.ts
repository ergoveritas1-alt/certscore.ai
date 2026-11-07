/** Retained-file replay for the shared web receipt codec. */
import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { encodeVerifiedPrivacyFormReceipt, privacyFormBindingSchema } from '../../apps/web/server/scans/privacy-form-audit-receipt';
import { loadPersistedP2Sources, type PersistedP2Inputs } from './audit-p2-persisted';

export {
  buildPrivacyFormProjection,
  encodeVerifiedPrivacyFormReceipt,
  privacyFormReceiptFromInventory,
  readPrivacyFormAuditReceipt,
  PRIVACY_FORM_RECEIPT_FIELDS,
  PRIVACY_FORM_RECEIPT_VERSION,
  PRIVACY_FORM_RECEIPT_MAX_BYTES,
  PRIVACY_FORM_PROJECTION_MAX_BYTES,
  type PrivacyFormBinding,
  type PrivacyFormReceiptReference,
} from '../../apps/web/server/scans/privacy-form-audit-receipt';

const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

/** Build only from exact, existing local reports whose creator and original artifacts have been verified. */
export function* buildLocalPrivacyFormAuditReceipts(data: PersistedP2Inputs) {
  const verified = loadPersistedP2Sources(data);
  const rows = new Map(data.rows.map(row => [row.scanId, row]));
  for (const parent of verified.summary.receipts.filter(receipt => receipt.status === 'verified_unique_source')) {
    const row = rows.get(parent.scanId);
    const source = verified.byScan.get(parent.scanId);
    if (!row || !source) throw Error('Verified privacy/form parent is missing from the current cohort');
    // The shared reader verified the original manifest and bundle. Recheck the exact parent bytes
    // before using its event hashes and typed collection assessment to create the compact receipt.
    if (statSync(parent.file).size !== parent.bytes || parent.bytes > 20_000_000) throw Error('Changed privacy/form parent size');
    const parentBytes = readFileSync(parent.file);
    if (parentBytes.length !== parent.bytes || sha256(parentBytes) !== parent.sha256) throw Error('Changed privacy/form parent bytes');
    const doc = JSON.parse(parentBytes.toString('utf8'));
    const snapshot = parent.kind === 'retained_report' ? doc.snapshot : doc;
    const payload = snapshot.report_projection_payload;
    const original = payload.events.find((event: { eventType: string }) => event.eventType === 'v2_lambda_result.received').metadataJson;
    const binding = privacyFormBindingSchema.parse({
      scanId: row.scanId, createdAt: row.createdAt, generation: parent.generation,
      projectionSourceHash: parent.sourceHash, projectionPayloadSha256: parent.payloadSha256,
      originalRequestId: parent.originalRequestId, originalBundleSha256: original.artifactMetadata.scanArtifactUri.sha256,
      originalManifestSha256: original.artifactMetadata.manifestUri.sha256, persistedSourceSha256: parent.sha256,
    });
    const encoded = encodeVerifiedPrivacyFormReceipt(payload, binding);
    // Some retained archive rows only carry a display label. Their original
    // creator was independently verified by the parent reader above.
    const boundRow = { ...row, originRequestId: binding.originalRequestId };
    yield { row: boundRow, ...encoded, original: source };
  }
}
