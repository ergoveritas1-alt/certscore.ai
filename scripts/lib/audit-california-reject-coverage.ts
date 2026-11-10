import { z } from 'zod';
import type { ProgressRow } from './audit-progress';

const reason = z.enum([
  'qualified_collection', 'request_metadata_unavailable', 'restricted_or_unresolved_processing',
  'payload_uninspected', 'response_unverified', 'request_proof_incomplete',
  'qualification_unresolved', 'sale_sharing_purpose_unresolved',
]);
const receipt = z.tuple([
  z.literal(1),
  z.enum(['california-post-reject.v1', 'california-post-reject.v2-qualified-disclosure',
    'california-post-reject.v3-property-bound', 'california-post-reject.v4-retained-scope',
    'california-post-reject.v5-index-auction', 'california-post-reject.v6-auctions']),
  z.enum(['qualified_collection', 'no_eligible_collection', 'insufficient_evidence']),
  z.enum(['cookie_tracking_rejection', 'unknown']),
  z.boolean(),
  z.array(reason).max(8).nullable(),
]);

// Project only assessment codes and distinct reason codes. The caller already
// restricts the inventory to the original-creator cohort.
export const CALIFORNIA_REJECT_COVERAGE_SQL = `(select jsonb_build_array(1,c->'policyVersion',c->'status',c->'scope',c->'requestsTruncated',
 (select jsonb_agg(distinct x->'reason') from jsonb_array_elements(c->'requests') x))
 from (select p.report_projection_payload->'runtimeArtifacts' a) t,
 lateral (select a->'californiaPostRejectAssessment' c,a->'postRefusalEvidenceProjection' b) u
 where p.report_projection_status='ready' and not o."isCanary"
 and b#>'{execution,clickCompleted}'='true' and c->>'scanId'=s.id::text
 and c->>'sourcePacketSha256'=b->>'packetSha256'
 and c->>'targetSha256'=b#>>'{sourceIdentity,targetSha256}'
 and jsonb_typeof(c->'requests')='array' and c->'requests'->32 is null)`;

export function readCaliforniaRejectCoverage(value: unknown): ProgressRow['californiaRejectCoverage'] {
  if (Buffer.byteLength(JSON.stringify(value) ?? '') > 512) return;
  const parsed = receipt.safeParse(value);
  if (!parsed.success) return;
  const [, policyVersion, status, scope, truncated, reasons] = parsed.data;
  const requestReasons = reasons ?? [];
  if (new Set(requestReasons).size !== requestReasons.length ||
      (status === 'qualified_collection') !== requestReasons.includes('qualified_collection')) return;
  return {
    policyVersion, status,
    reasons: [
      ...requestReasons.filter(value => value !== 'qualified_collection'),
      ...(scope === 'unknown' ? ['reject_scope_unknown'] : []),
      ...(truncated ? ['request_inventory_truncated'] : []),
    ].sort(),
  };
}
