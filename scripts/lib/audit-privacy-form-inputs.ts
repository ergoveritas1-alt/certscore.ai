import { readFileSync, statSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import { verifiedReceipt } from './audit-progress-retained-artifacts';
import { retainedGenerationMatches, type OptOutReceipt } from './audit-progress-opt-out';
import {
  PRIVACY_FORM_RECEIPT_MAX_BYTES,
  privacyFormReceiptFromInventory,
  readPrivacyFormAuditReceipt,
  type PrivacyFormReceiptReference,
} from './audit-privacy-form-receipt';
import type { PersistedP2Source } from './audit-p2-coverage';
import type { ProgressRow } from './audit-progress';

export type PrivacyFormInput = OptOutReceipt & PrivacyFormReceiptReference & { delivery?: 'delta_inventory' };
type LatestSelection = Map<string, { cutoff: number; value: any }>;

export function collectPrivacyFormSelections(selection: any, wanted: ReadonlySet<string>, selected: LatestSelection) {
  if (selection.version !== 'certscore.mac-mini-direct-id-inventory.v1') return;
  const cutoff = Date.parse(selection.end);
  if (selection.readOnly !== true || !Number.isFinite(cutoff) ||
      !Array.isArray(selection.rows) || selection.rows.length > 5000) throw Error('Invalid privacy/form selection');
  const seen = new Set<string>();
  for (const value of selection.rows) {
    if (!wanted.has(value.scanId)) continue;
    if (seen.has(value.scanId)) throw Error('Duplicate privacy/form selection');
    seen.add(value.scanId);
    const previous = selected.get(value.scanId);
    if (previous?.cutoff === cutoff && !isDeepStrictEqual(value, previous.value)) throw Error('Conflicting privacy/form selections');
    if (!previous || cutoff >= previous.cutoff) selected.set(value.scanId, { cutoff, value });
  }
}

export function privacyFormSelectionMatches(input: Pick<PrivacyFormInput, 'binding'>, selection: any) {
  const binding = input.binding;
  return selection?.scanId === binding.scanId && selection.isMacMini === true && selection.isCanary === false
    && ['completed', 'completed_limited'].includes(selection.status) && selection.projection_status === 'ready'
    && selection.publicationRequestStatus !== 'terminal_failure' && selection.originalRequestId === binding.originalRequestId
    && Date.parse(selection.created_at) === Date.parse(binding.createdAt)
    && selection.projection_version === binding.generation && selection.projection_source_hash === binding.projectionSourceHash
    && selection.projection_payload_sha256 === binding.projectionPayloadSha256;
}

/** The local manifest supplies trusted file hashes; the already-retained ID query supplies creator and generation proof. */
export function loadPrivacyFormInputs(rows: ProgressRow[], inputs: PrivacyFormInput[], selections: OptOutReceipt[]) {
  if (!Array.isArray(inputs) || inputs.length > 15_000) throw Error('Invalid privacy/form input list');
  const byScan = new Map<string, PersistedP2Source>();
  if (!inputs.length) return byScan;
  const reportable = new Map(rows.filter(row => row.reportable).map(row => [row.scanId, row]));
  const wanted = new Map<string, PrivacyFormInput>();
  for (const input of inputs) {
    const id = input?.binding?.scanId;
    if (typeof id !== 'string' || wanted.has(id)) throw Error('Missing or duplicate privacy/form receipt identity');
    wanted.set(id, input);
  }

  const selected: LatestSelection = new Map();
  const ids = new Set(wanted.keys());
  const delivered = new Map<string, string>();
  if (selections.length > 64) throw Error('Too many privacy/form selection sources');
  for (const source of selections) {
    if (statSync(source.file).size > 32_000_000) throw Error('Privacy/form selection exceeds byte bound');
    const selection = JSON.parse(verifiedReceipt(source, 32_000_000).toString('utf8'));
    collectPrivacyFormSelections(selection, ids, selected);
    if (selection.version !== 'certscore.mac-mini-direct-id-inventory.v1') continue;
    for (const row of selection.rows) {
      const input = wanted.get(row.scanId);
      if (input?.delivery !== 'delta_inventory' || !privacyFormSelectionMatches(input, row)) continue;
      const receipt = privacyFormReceiptFromInventory(row);
      if (!receipt) continue;
      if (delivered.has(row.scanId) && delivered.get(row.scanId) !== receipt.reference.sha256) {
        throw Error('Conflicting inventory privacy/form deliveries for the same generation');
      }
      delivered.set(row.scanId, receipt.reference.sha256);
    }
  }
  for (const [id, input] of wanted) {
    const row = reportable.get(id);
    if (!row) continue;
    const selection = selected.get(id)?.value;
    if (!privacyFormSelectionMatches(input, selection) || !retainedGenerationMatches(selection, row) ||
        row.originProof === 'original_credential_verified' && /^pulse_req_/.test(row.originRequestId) &&
          row.originRequestId !== selection.originalRequestId) {
      throw Error('Privacy/form receipt lacks matching current ID, creator and ready projection proof');
    }
    if (statSync(input.file).size > PRIVACY_FORM_RECEIPT_MAX_BYTES) throw Error('Privacy/form receipt exceeds byte cap');
    if (input.delivery === 'delta_inventory') {
      // Overlapping inventories can explicitly omit optional transport. A retained
      // same-generation delivery can still supply the receipt when that happens.
      const expected = delivered.get(id);
      if (expected !== input.sha256) throw Error('Privacy/form receipt lacks matching immutable inventory delivery');
    }
    const bytes = readFileSync(input.file);
    byScan.set(id, readPrivacyFormAuditReceipt(bytes, input, {
      ...row, originProof: 'original_credential_verified', originRequestId: selection.originalRequestId,
    }));
  }
  return byScan;
}

export function reconcilePrivacyFormSources(compact: PersistedP2Source, original: PersistedP2Source) {
  for (const field of compact.fields) {
    const exact = original.fields.find(value => value.legacyId === field.legacyId);
    const samples = field.legacyId.startsWith('privacy.')
      ? exact?.samples.map(sample => ({ ...sample, value: {} }))
      : exact?.samples;
    if (!exact || !isDeepStrictEqual(field, { ...exact, samples })) {
      throw Error('Privacy/form receipt conflicts with retained evidence: ' + field.legacyId);
    }
  }
}
