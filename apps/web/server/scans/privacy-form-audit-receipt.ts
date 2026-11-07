import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { z } from 'zod';
import {
  collectionSurfaceAssessmentSchema,
  collectionSurfaceInventoryCoverageSchema,
  collectionSurfaceSemanticCategorySchema,
  MAX_COLLECTION_SURFACE_FIELDS,
  MAX_COLLECTION_SURFACE_FIELDS_PER_FORM,
  MAX_COLLECTION_SURFACE_FORMS,
} from '@certscore/contracts';
import {
  persistedP2Fields,
  stablePrivacyFormJson,
  type P2Field,
  type P2Sample,
  type PersistedP2Source,
} from './privacy-form-audit-fields';

export const PRIVACY_FORM_RECEIPT_VERSION = 'certscore.audit-privacy-form-receipt.v1';
export const PRIVACY_FORM_RECEIPT_MAX_BYTES = 32 * 1024;
export const PRIVACY_FORM_PROJECTION_MAX_BYTES = 6_144;

const californiaIds = {
  assessment: 'privacy.california.assessment',
  coverage: 'privacy.california.coverage',
  rights: 'privacy.rights.assessment',
  collectionNotice: 'privacy.collection_notice.assessment',
  saleSharing: 'privacy.sale_sharing.assessment',
} as const;
const categoryId = 'collection.field.semantic_category';
const destinationId = 'collection.form.action_relationship';
export const PRIVACY_FORM_RECEIPT_FIELDS = [...Object.values(californiaIds), categoryId, destinationId];

const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const token = z.string().min(1).max(120).regex(/^[a-z0-9_.:-]+$/i);
const policy = z.string().min(1).max(260).regex(/^[a-z0-9_.\/-]+$/i);
export const privacyFormBindingSchema = z.object({
  scanId: z.string().uuid(),
  createdAt: z.string().datetime({ offset: true }),
  generation: token,
  projectionSourceHash: hash,
  projectionPayloadSha256: hash,
  originalRequestId: z.string().max(160).regex(/^pulse_req_[a-z0-9_-]+$/i),
  originalBundleSha256: hash,
  originalManifestSha256: hash,
  persistedSourceSha256: hash,
}).strict();
export type PrivacyFormBinding = z.infer<typeof privacyFormBindingSchema>;
type ScanBinding = {
  scanId: string;
  createdAt: string;
  reportable: boolean;
  projectionVersion: string;
  publicProjectionSourceHash?: string;
  originProof?: string;
  originRequestId: string;
};

const absentCalifornia = z.object({
  status: z.enum(['not_retained', 'invalid_or_unbound']),
}).strict();
const facetName = /^(choiceSurface|optOutEffectiveness|runtimeCoverage|captureCoverage\.(policyTextComplete|choiceInventoryComplete|collectionInventoryComplete)|family\.[a-z_]+\.(status|assessmentState|followUp)|topic\.[a-z_]+\.status|inventoryComplete|point\.(status|assessmentScope|categoryMatch|purposeMatch|purposeBasis))$/;
const californiaField = z.union([absentCalifornia, z.object({
  status: z.literal('available'),
  policy,
  facets: z.record(z.string().regex(facetName), z.array(token).min(1).max(12))
    .refine(facets => Object.keys(facets).length <= 22, 'Too many assessment dimensions'),
}).strict()]);

const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const formSchema = z.object({
  formRef: token.max(80),
  actionRelationship: z.enum(['same_site', 'third_party', 'self', 'none', 'unknown']),
  candidateFieldCount: count,
  retainedFieldCount: count.max(MAX_COLLECTION_SURFACE_FIELDS_PER_FORM),
  fieldsTruncated: z.boolean(),
  fields: z.array(z.object({
    fieldRef: token.max(80),
    semanticCategory: collectionSurfaceSemanticCategorySchema,
  }).strict()).max(MAX_COLLECTION_SURFACE_FIELDS_PER_FORM),
}).strict();
const formsSchema = z.union([
  z.object({ status: z.enum(['not_retained', 'invalid_or_unbound']) }).strict(),
  z.object({
    status: z.literal('assessment_retained'),
    contractVersion: collectionSurfaceAssessmentSchema.shape.contractVersion,
    sourceInventoryContractVersion: collectionSurfaceAssessmentSchema.shape.sourceInventoryContractVersion,
    inventorySha256: hash.nullable(),
    assessmentStatus: collectionSurfaceAssessmentSchema.shape.assessmentStatus,
    coverage: collectionSurfaceInventoryCoverageSchema.extend({
      reasonCodes: z.array(token.max(80)).max(12),
    }).nullable(),
    limitationKeys: z.array(token.max(80)).max(12),
    forms: z.array(formSchema).max(MAX_COLLECTION_SURFACE_FORMS),
  }).strict().superRefine((data, ctx) => {
    const fields = data.forms.reduce((n, form) => n + form.fields.length, 0);
    const inconsistentRecords = new Set(data.forms.map(form => form.formRef)).size !== data.forms.length
      || data.forms.some(form => form.retainedFieldCount !== form.fields.length
        || form.candidateFieldCount < form.retainedFieldCount
        || new Set(form.fields.map(field => field.fieldRef)).size !== form.fields.length);
    const inconsistentCoverage = data.assessmentStatus !== 'not_testable' && data.coverage &&
      (data.coverage.retainedFormCount !== data.forms.length || data.coverage.retainedFieldCount !== fields);
    if (inconsistentRecords || inconsistentCoverage || fields > MAX_COLLECTION_SURFACE_FIELDS
        || data.assessmentStatus === 'not_testable' && data.forms.length > 0) {
      ctx.addIssue({ code: 'custom', message: 'Inconsistent retained form records or coverage' });
    }
  }),
]);

const compactFields = z.object({
  california: z.object({
    assessment: californiaField,
    coverage: californiaField,
    rights: californiaField,
    collectionNotice: californiaField,
    saleSharing: californiaField,
  }).strict(),
  initialPassiveForms: formsSchema,
}).strict();
const receiptSchema = compactFields.extend({
  version: z.literal(PRIVACY_FORM_RECEIPT_VERSION),
  binding: privacyFormBindingSchema,
});
const projectionSchema = compactFields.extend({
  version: z.literal('certscore.audit-privacy-form-projection.v1'),
  scanId: privacyFormBindingSchema.shape.scanId,
  createdAt: privacyFormBindingSchema.shape.createdAt,
  originalBundleSha256: hash,
  originalManifestSha256: hash,
});
type Receipt = z.infer<typeof receiptSchema>;
export type PrivacyFormReceiptReference = { bytes: number; sha256: string; binding: PrivacyFormBinding };

function compactCalifornia(field: P2Field): z.infer<typeof californiaField> {
  const sample = field.samples[0];
  if (!sample) return absentCalifornia.parse({ status: field.status });
  if (field.samples.length !== 1 || sample.availability !== 'available' || !sample.groupPolicy) {
    throw Error('Unexpected persisted California assessment shape');
  }
  return { status: 'available', policy: sample.groupPolicy, facets: sample.facets ?? {} };
}

function compactForms(raw: unknown): z.infer<typeof formsSchema> {
  if (!raw) return { status: 'not_retained' };
  const result = collectionSurfaceAssessmentSchema.safeParse(raw);
  if (!result.success) return { status: 'invalid_or_unbound' };
  const assessment = result.data;
  return {
    status: 'assessment_retained',
    contractVersion: assessment.contractVersion,
    sourceInventoryContractVersion: assessment.sourceInventoryContractVersion,
    inventorySha256: assessment.sourceHash,
    assessmentStatus: assessment.assessmentStatus,
    coverage: assessment.coverage,
    limitationKeys: assessment.limitationKeys,
    forms: assessment.forms.map(form => ({
      formRef: form.formRef,
      actionRelationship: form.actionRelationship,
      candidateFieldCount: form.candidateFieldCount,
      retainedFieldCount: form.retainedFieldCount,
      fieldsTruncated: form.fieldsTruncated,
      fields: form.fields.map(({ fieldRef, semanticCategory }) => ({ fieldRef, semanticCategory })),
    })),
  };
}

function decodeForms(data: Receipt['initialPassiveForms']): P2Field[] {
  const absent = (status: string) => [categoryId, destinationId].map(legacyId => ({ legacyId, status, samples: [] }));
  if (data.status !== 'assessment_retained') return absent(data.status);
  if (data.assessmentStatus === 'not_testable') return absent('not_testable');
  if (!data.inventorySha256 || !data.sourceInventoryContractVersion) return absent('source_binding_unavailable');

  const scope = [
    data.contractVersion, 'initial_passive_main_document', data.sourceInventoryContractVersion,
    stablePrivacyFormJson({ assessmentStatus: data.assessmentStatus, coverage: data.coverage, limitations: data.limitationKeys }),
  ].join('/');
  const status = 'limited_or_empty_inventory';
  const empty = data.assessmentStatus === 'not_observed' && data.forms.length === 0
    && data.coverage?.status === 'complete' && data.coverage.candidateFormCount === 0
    && data.coverage.candidateFieldCount === 0 && !data.coverage.retentionTruncated
    && !data.coverage.candidateScanTruncated;
  if (empty) {
    const sample: P2Sample = {
      recordKey: '@inventory', value: [], qualification: scope, groupPolicy: scope, availability: 'empty_inventory',
    };
    return [categoryId, destinationId].map(legacyId => ({ legacyId, status, samples: [sample] }));
  }

  const categories: P2Sample[] = [];
  const destinations: P2Sample[] = [];
  for (const form of data.forms) {
    const groupPolicy = scope + '/' + stablePrivacyFormJson({
      candidateFields: form.candidateFieldCount, retainedFields: form.retainedFieldCount, truncated: form.fieldsTruncated,
    });
    const key = data.inventorySha256 + '/' + form.formRef;
    const sample = (recordKey: string, value: string): P2Sample => ({
      recordKey, value, qualification: groupPolicy, groupPolicy, availability: value === 'unknown' ? 'unknown' : 'available',
    });
    destinations.push(sample(key, form.actionRelationship));
    for (const field of form.fields) categories.push(sample(key + '/' + field.fieldRef, field.semanticCategory));
  }
  return [
    { legacyId: categoryId, status, samples: categories },
    { legacyId: destinationId, status, samples: destinations },
  ];
}

/** The expected reference must come from the verified producer, not from the supplied receipt bytes. */
export function readPrivacyFormAuditReceipt(
  bytes: Uint8Array,
  expected: PrivacyFormReceiptReference,
  row: ScanBinding,
): PersistedP2Source {
  if (bytes.byteLength > PRIVACY_FORM_RECEIPT_MAX_BYTES) throw Error('Privacy/form receipt exceeds byte cap');
  if (bytes.byteLength !== expected.bytes || sha256(bytes) !== expected.sha256) {
    throw Error('Privacy/form receipt size or checksum mismatch');
  }
  const receipt = receiptSchema.parse(JSON.parse(Buffer.from(bytes).toString('utf8')));
  const binding = receipt.binding;
  if (!isDeepStrictEqual(binding, privacyFormBindingSchema.parse(expected.binding)) ||
      !row.reportable || row.originProof !== 'original_credential_verified' ||
      binding.scanId !== row.scanId || binding.createdAt !== row.createdAt ||
      binding.generation !== row.projectionVersion || binding.projectionSourceHash !== row.publicProjectionSourceHash ||
      binding.originalRequestId !== row.originRequestId) {
    throw Error('Privacy/form receipt does not match current scan, creator, generation or source binding');
  }

  const fields: P2Field[] = Object.entries(californiaIds).map(([key, legacyId]) => {
    const entry = receipt.california[key as keyof typeof californiaIds];
    return {
      legacyId,
      status: entry.status === 'available' ? 'not_retained' : entry.status,
      samples: entry.status === 'available' ? [{
        recordKey: 'assessment', value: {}, availability: 'available', groupPolicy: entry.policy,
        qualification: entry.policy + '/' + binding.originalBundleSha256, facets: entry.facets,
      }] : [],
    };
  });
  return {
    sourceView: 'persisted_assessment', schema: receipt.version, generation: binding.generation,
    originProof: 'original_credential_verified', fields: [...fields, ...decodeForms(receipt.initialPassiveForms)],
  };
}

function projectFields(payload: any, scanId: string, bundleSha256: string) {
  const source = persistedP2Fields(payload, scanId, bundleSha256);
  const california = Object.fromEntries(Object.entries(californiaIds).map(([key, id]) => {
    const field = source.fields.find(field => field.legacyId === id);
    if (!field) throw Error('Verified California field missing: ' + id);
    return [key, compactCalifornia(field)];
  }));
  return {
    california,
    initialPassiveForms: compactForms(payload.canonicalReportProjection?.collectionSurfaceAssessment),
  };
}

function encodeReceipt(fields: ReturnType<typeof projectFields>, binding: PrivacyFormBinding) {
  const receipt = receiptSchema.parse({ ...fields, version: PRIVACY_FORM_RECEIPT_VERSION, binding });
  // Keep the established byte order for existing v1 receipt hashes and retries.
  const { version, california, initialPassiveForms } = receipt;
  const bytes = Buffer.from(JSON.stringify({ version, binding: receipt.binding, california, initialPassiveForms }) + '\n');
  if (bytes.length > PRIVACY_FORM_RECEIPT_MAX_BYTES) throw Error('Privacy/form receipt exceeds byte cap');
  return { bytes, reference: { bytes: bytes.length, sha256: sha256(bytes), binding: receipt.binding } };
}

/** Shared encoder. Callers establish creator, ready payload and original-artifact proof first. */
export function encodeVerifiedPrivacyFormReceipt(payload: any, binding: PrivacyFormBinding) {
  return encodeReceipt(projectFields(payload, binding.scanId, binding.originalBundleSha256), binding);
}

/** Persist only the compact fields and artifact ancestry. The read-only inventory
 * supplies original creator and final payload checksum after publication. */
export function buildPrivacyFormProjection(payload: any): string | undefined {
  const { id: scanId, createdAt, status } = payload.scan;
  if (status !== 'completed') return;
  const source = payload.runtimeArtifacts?.gdprNarrowPostureSource;
  const events = payload.events.filter((event: { eventType: string }) => event.eventType === 'v2_lambda_result.received');
  const artifacts = events[0]?.metadataJson?.artifactMetadata;
  const originalBundleSha256 = artifacts?.scanArtifactUri?.sha256;
  const originalManifestSha256 = artifacts?.manifestUri?.sha256;
  if (events.length !== 1 || source?.scanId !== scanId || source.verificationStatus !== 'verified' ||
      source.sha256 !== originalBundleSha256 || !hash.safeParse(originalBundleSha256).success ||
      !hash.safeParse(originalManifestSha256).success) return;
  const projection = projectionSchema.parse({
    ...projectFields(payload, scanId, originalBundleSha256),
    version: 'certscore.audit-privacy-form-projection.v1',
    scanId, createdAt, originalBundleSha256, originalManifestSha256,
  });
  const serialized = JSON.stringify(projection);
  if (Buffer.byteLength(serialized) <= PRIVACY_FORM_PROJECTION_MAX_BYTES) return serialized;
  return 'size_bound';
}

export function privacyFormReceiptFromInventory(selection: any) {
  const value = selection.auditPrivacyForm;
  if (value == null || value === 'size_bound') return;
  if (typeof value !== 'string' || Buffer.byteLength(value) > PRIVACY_FORM_PROJECTION_MAX_BYTES) {
    throw Error('Privacy/form inventory projection exceeds its byte bound or has an invalid type');
  }
  const projection = projectionSchema.parse(JSON.parse(value));
  if (projection.scanId !== selection.scanId || Date.parse(projection.createdAt) !== Date.parse(selection.created_at)) {
    throw Error('Privacy/form inventory projection scan or time mismatch');
  }
  return encodeReceipt({ california: projection.california, initialPassiveForms: projection.initialPassiveForms }, {
    scanId: projection.scanId, createdAt: projection.createdAt, generation: selection.projection_version,
    projectionSourceHash: selection.projection_source_hash, projectionPayloadSha256: selection.projection_payload_sha256,
    originalRequestId: selection.originalRequestId, originalBundleSha256: projection.originalBundleSha256,
    originalManifestSha256: projection.originalManifestSha256, persistedSourceSha256: selection.projection_payload_sha256,
  });
}
