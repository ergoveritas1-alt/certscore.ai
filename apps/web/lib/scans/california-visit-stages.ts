import {buildAuditRejectActivity} from "../../server/scans/audit-reject-activity";
import {readGpcCookieIdentity} from "./gpc-cookie-inventory";
import { gpcActivityComparisonSchema, gpcCompleteComparisonDeltaSchema, gpcBoundedObservationSchema, gpcPolicyCollectionEvidenceIds } from "@certscore/contracts";
import { z } from "zod";
import { assessCaliforniaPostReject } from "./california-post-reject-policy";
import { assessGpcCollectionReviewObservation, assessRejectPotentialRisk, CA_VERIFIED_COLLECTION_POLICY, type CaliforniaPotentialRiskAssessment } from "./california-potential-risk-policy";

const count = z.number().int().nonnegative().nullable();
const visit = z.object({
  sourceSha256: z.string().regex(/^[a-f0-9]{64}$/),
  classifiedPresence: z.literal(true).optional(),
  recipients: z.tuple([count, count, count]),
}).strict().refine(({recipients:[presence,verified,full]}) =>
  (!verified || presence !== null && presence >= verified) &&
  (!full || verified !== null && verified >= full), "Visit stages must be cumulative");
export const visitStagesSchema = z.object({
  version: z.literal("california.visit-stages.v1"),
  scanId: z.string().min(1),
  reject: visit.nullable(),
  gpc: visit.nullable(),
}).strict();

function stageCounts(risk: CaliforniaPotentialRiskAssessment | null, qualified: string[] | null, presenceInventory: boolean, sourceSha256: string) {
  const full = new Set(qualified);
  const verified = new Set(full);
  const presence = new Set(full);
  for (const row of risk?.rows ?? []) {
    // A qualified review row can be a candidate outside the full assessment's
    // verified inventory. Only the full policy can establish stage 3.
    presence.add(row.entityId);
    if (row.verifiedCollection) verified.add(row.entityId);
  }
  const recipients: [number|null, number|null, number|null] = [
    presence.size || (risk && presenceInventory ? 0 : null),
    verified.size || (risk ? 0 : null),
    qualified ? full.size : null,
  ];
  return {sourceSha256, recipients};
}

// The archived public comparison retains the original worker hash even when it
// omits private artifact URIs. Require that link before reading the observation.
export function gpcVisitStages(scanId: string, value: unknown, pairedActivity?: unknown) {
  const response = value as {contractVersion?: string; observation?: unknown; activityComparison?: unknown; comparison?: {baselineArtifact?: {sha256?: string}; gpcArtifact?: {sha256?: string}; deltas?: {cookies?: unknown; trackers?: unknown}}} | null;
  if (response?.contractVersion !== "certscore.gpc-response-assessment.v3") return null;
  const o = gpcBoundedObservationSchema.safeParse(response.observation).data;
  if (!o || o.scanId !== scanId || !o.sourceSha256 || o.sourceSha256 !== response.comparison?.gpcArtifact?.sha256 ||
      !o.sessionSha256 || !o.documentUrlSha256 || !o.delivery.httpHeaderRetained || !o.delivery.mainNavigatorReadbackRetained ||
      !o.positiveEvidence?.representativeDocument || o.status === "unavailable") return null;
  const ids = new Set(gpcPolicyCollectionEvidenceIds(o));
  const qualified = o.requests.advertisingCollectionQualification && o.requests.advertisingCollectionRecipients
    ? o.requests.advertisingCollectionRecipients.rows.filter(r => ids.has(r.evidenceId)).map(r => r.entityId) : null;
  const stages = stageCounts(assessGpcCollectionReviewObservation(o, CA_VERIFIED_COLLECTION_POLICY), qualified, !!o.presenceEvidence, o.sourceSha256);
  if (stages.recipients[0]) return stages;
  const comparison = response.comparison;
  const trackers = gpcCompleteComparisonDeltaSchema.safeParse(comparison.deltas?.trackers).data;
  const cookies = gpcCompleteComparisonDeltaSchema.safeParse(comparison.deltas?.cookies).data;
  const hasTracker = trackers && [...trackers.shared, ...trackers.gpcOnly].some(key =>
    /^[^|]+[|][^|]+[|](advertising|marketing|analytics|session_replay)$/.test(key));
  const hasCookie = cookies && [...cookies.shared, ...cookies.gpcOnly].some(key =>
    readGpcCookieIdentity(key)?.essentiality === "non_essential");
  const pair = gpcActivityComparisonSchema.safeParse(pairedActivity ?? response.activityComparison).data;
  const hasRequest = pair && pair.scanId === scanId && pair.sourceHashes.gpc === o.sourceSha256 &&
    pair.sourceHashes.baseline === comparison.baselineArtifact?.sha256 &&
    (pair.activity.advertisingMarketing.gpcRequests > 0 || pair.activity.analyticsReplay.gpcRequests > 0);
  // A visit-level observation proves presence without assigning another recipient or proving collection.
  return hasTracker || hasCookie || hasRequest ? {...stages, classifiedPresence:true as const} : stages;
}

export function californiaVisitStages(scanId: string, runtime: Record<string, unknown> | null | undefined, existingActivity?: ReturnType<typeof buildAuditRejectActivity>) {
  const projection = runtime?.postRefusalEvidenceProjection ?? runtime?.post_refusal_evidence_projection;
  const partial = assessRejectPotentialRisk(projection);
  const full = assessCaliforniaPostReject(projection);
  const bound = full && full.scanId === scanId && full.scope === "cookie_tracking_rejection" && full.sourcePacketSha256;
  const risk = bound && partial?.scanId === scanId && partial.sourceSha256 === bound ? partial : null;
  const qualified = full && full.status !== "insufficient_evidence" ? full.recipientIds : null;
  let reject: z.infer<typeof visit> | null = bound ? stageCounts(risk, qualified, true, bound) : null;
  const activity = existingActivity ?? buildAuditRejectActivity(scanId, projection);
  if (activity && !["capture_unavailable","source_unbound","classification_unavailable"].includes(activity[3]) &&
      (!reject || activity[2] === reject.sourceSha256)) {
    // A classified snapshot or write can establish presence even without a named recipient.
    reject = {...(reject ?? {sourceSha256:activity[2],recipients:[null,null,null]}), classifiedPresence:true};
  }
  return {version:"california.visit-stages.v1" as const, scanId, reject,
    gpc:gpcVisitStages(scanId, runtime?.gpcResponseAssessment, runtime?.gpcActivityComparison)};
}
