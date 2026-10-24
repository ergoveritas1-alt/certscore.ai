import {z} from "zod";
import {californiaPrivacyReviewSchema, gpcResponseAssessmentSchema, type CaliforniaPrivacyReview} from "@certscore/contracts";
import {californiaPotentialRiskSchema, type CaliforniaPotentialRiskAssessment} from "./california-potential-risk-contract";
import {deriveCaliforniaGpcResponsePolicy} from "./california-gpc-response-policy";
import {isDetailedOnlyCaliforniaDisclosure} from "./california-disclosure-priority";

type Finding = {id?: string; evidenceJson?: Record<string, unknown>};
export const californiaPriorityBindingSchema = z.object({
  version:z.literal("california_priority_binding.v1"), scanId:z.string().min(1),
  documentUrl:z.string().url(), documentUrlSha256:z.string().regex(/^[a-f0-9]{64}$/), sourceHash:z.string().regex(/^[a-f0-9]{64}$/),
  qualifiedPostReject:z.object({sourcePacketSha256:z.string().regex(/^[a-f0-9]{64}$/),recipientIds:z.array(z.string().regex(/^ent_[a-f0-9]{12}$/)).min(1).max(32)}).strict().optional(),
}).strict();

export const californiaGpcPriorityBindingSchema = z.object({
  version:z.literal("california_gpc_priority_binding.v1"), scanId:z.string().min(1),
  sourceSha256:z.string().regex(/^[a-f0-9]{64}$/), sessionSha256:z.string().regex(/^[a-f0-9]{64}$/),
  documentUrlSha256:z.string().regex(/^[a-f0-9]{64}$/),
}).strict();

function gpcEvidence(finding: Finding) {
  if (finding.id !== "gpc_response") return null;
  const p = gpcResponseAssessmentSchema.safeParse(finding.evidenceJson?.assessment);
  if (!p.success || p.data.contractVersion !== "certscore.gpc-response-assessment.v3") return null;
  const policy = deriveCaliforniaGpcResponsePolicy(p.data);
  return policy.scoreEffect === "deduction" ? {observation:p.data.observation, policy} : null;
}
function collectionEvidence(finding: Finding): CaliforniaPotentialRiskAssessment[] | null {
  if (finding.id !== "california_collection_review") return null;
  const raw = finding.evidenceJson?.assessments;
  if (!Array.isArray(raw) || !raw.length || raw.length > 2) return null;
  const rows = raw.map(value => californiaPotentialRiskSchema.safeParse(value));
  if (rows.some(row => !row.success)) return null;
  const assessments = rows.flatMap(row => row.success ? [row.data] : []);
  if (new Set(assessments.map(row => row.scanId)).size !== 1 || new Set(assessments.map(row => row.path)).size !== assessments.length) return null;
  return assessments;
}
function explicitChoiceCorroboration(review: CaliforniaPrivacyReview) {
  if ("saleSharingAssessment" in review && review.saleSharingAssessment?.choiceBasis === "declared_sale_or_sharing") return true;
  return review.optOutObservation?.verificationStatus === "verified" && review.optOutObservation.evidence.registration === "confirmed" &&
    review.optOutObservation.evidence.requests.some(row => row.collectionEvidence && row.httpStatus < 400);
}
export type CaliforniaPriorityDemotion = "non_discrimination_only" | "uncorroborated_choice_absence" | "analytics_only_collection" | "same_gpc_recipients";

/** Editorial selection of canonical projected findings only. Never mutates
 * packets, coverage, snapshot state or score inputs. A malformed record cannot
 * become the basis for demoting another finding. */
export function californiaPriorityDemotion(finding: Finding, findings: readonly Finding[]): CaliforniaPriorityDemotion | null {
  if (isDetailedOnlyCaliforniaDisclosure(finding)) return "non_discrimination_only";
  if (finding.id !== "california_privacy_choice_not_observed" && finding.id !== "california_collection_review") return null;
  const gpc = findings.flatMap(row => {const value = gpcEvidence(row); return value ? [value] : [];});
  if (finding.id === "california_privacy_choice_not_observed") {
    const parsed = californiaPrivacyReviewSchema.safeParse(finding.evidenceJson?.californiaPrivacyReview);
    if (!parsed.success || parsed.data.choiceSurface !== "not_observed_in_inspected_scope") return null;
    const review = parsed.data;
    if (explicitChoiceCorroboration(review)) return null;
    const sourceBinding = californiaPriorityBindingSchema.safeParse(finding.evidenceJson?.californiaPriorityBinding);
    const bound = sourceBinding.success && sourceBinding.data.scanId === review.scanId &&
      sourceBinding.data.documentUrl === review.documentUrl && sourceBinding.data.sourceHash === review.sourceHash;
    if (sourceBinding.success && bound && sourceBinding.data.qualifiedPostReject) return null;
    // Invalid GPC metadata leaves the old presentation intact. Valid siblings
    // from other scans cannot corroborate this scan's choice obligation.
    if (findings.some(row => row.id === "gpc_response" && !gpcResponseAssessmentSchema.safeParse(row.evidenceJson?.assessment).success)) return null;
    const sameScan = gpc.filter(row => row.observation.scanId === review.scanId);
    if (sameScan.length) {
      const binding = californiaPriorityBindingSchema.safeParse(finding.evidenceJson?.californiaPriorityBinding);
      if (!binding.success || binding.data.scanId !== review.scanId || binding.data.documentUrl !== review.documentUrl || binding.data.sourceHash !== review.sourceHash) return null;
      if (sameScan.some(row => row.observation.documentUrlSha256 === binding.data.documentUrlSha256)) return null;
    }
    return "uncorroborated_choice_absence";
  }
  const assessments = collectionEvidence(finding);
  if (!assessments) return null;
  const potential = assessments.flatMap(row => row.rows.filter(item => item.treatment === "potential_risk"));
  if (!potential.length) return null;
  if (potential.every(row => row.purpose === "analytics")) return "analytics_only_collection";
  // Do not collapse separate Reject/opt-out paths. Exact same-source GPC
  // membership joins the original document/session, not just an entity label.
  const binding = californiaGpcPriorityBindingSchema.safeParse(finding.evidenceJson?.gpcPriorityBinding);
  if (!binding.success) return null;
  const covered = assessments.filter(a => a.rows.some(row => row.treatment === "potential_risk")).every(a => a.path === "gpc" && gpc.some(stronger => {
    const o = stronger.observation;
    if (o.scanId !== a.scanId || o.sourceSha256 !== a.sourceSha256 ||
      binding.data.scanId !== o.scanId || binding.data.sourceSha256 !== o.sourceSha256 ||
      binding.data.sessionSha256 !== o.sessionSha256 || binding.data.documentUrlSha256 !== o.documentUrlSha256) return false;
    const inventory = o.requests.collectionReview?.rows;
    return a.rows.filter(row => row.treatment === "potential_risk").every(row => (stronger.policy.recipientIds ?? []).includes(row.entityId) &&
      inventory?.some(raw => raw.evidenceId === row.evidenceId && raw.entityId === row.entityId && raw.purpose === row.purpose && raw.observedAtMs === row.msFromAnchor));
  }));
  return covered ? "same_gpc_recipients" : null;
}
export function selectCaliforniaPriorityFindings<T extends Finding>(findings: readonly T[]): T[] {
  return findings.filter(finding => californiaPriorityDemotion(finding, findings) === null);
}
