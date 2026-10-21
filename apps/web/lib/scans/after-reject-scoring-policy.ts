import { z } from "zod";
import { isCanonicalGoogleAnalyticsCollectionUrl } from "@certscore/vendor-resolver";
import { assessGoogleConsentModeRequest, postRefusalReportProjectionSchema, readBoundMeasurementRequestEvidence } from "@certscore/contracts";
import { assessRejectClickTracking } from "./reject-click-tracking-policy";
import { POST_REJECT_SCORING_TIERS } from "./scoring-policy";

export const AFTER_REJECT_SCORING_POLICY = "after_reject_measurement_tiers.v2" as const;
export const LEGACY_AFTER_REJECT_SCORING_POLICY = "after_reject_measurement_tiers.v1" as const;
const schema = z.object({
  policyVersion: z.enum([AFTER_REJECT_SCORING_POLICY, LEGACY_AFTER_REJECT_SCORING_POLICY]),
  sourcePacketSha256: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
  registration: z.enum(["confirmed", "unconfirmed", "unknown"]),
  tier: z.enum(["high_risk", "measurement", "performance_only", "review"]),
  deductionPoints: z.union([z.literal(0), z.literal(5), z.literal(15)]),
  requestIds: z.array(z.string().min(1).max(120)).max(192),
  reasons: z.array(z.enum(["verified_optional_activity", "verified_contradiction", "storage_denied_measurement",
    "verified_performance_only", "registration_unconfirmed", "source_proof_incomplete", "purpose_or_identifier_unverified",
    "storage_coverage_incomplete", "no_eligible_activity", "verified_reject_click"])).min(1).max(12),
}).strict().superRefine((value, ctx) => {
  if (value.deductionPoints !== POST_REJECT_SCORING_TIERS[value.tier] ||
    value.policyVersion === LEGACY_AFTER_REJECT_SCORING_POLICY && value.reasons.includes("verified_reject_click") ||
    value.tier !== "review" && (!value.sourcePacketSha256 ||
      value.registration !== "confirmed" && !(value.policyVersion === AFTER_REJECT_SCORING_POLICY && value.registration === "unconfirmed" && value.reasons.includes("verified_reject_click") && value.requestIds.length > 0)) ||
    value.tier === "high_risk" && !value.reasons.some(reason => ["verified_optional_activity", "verified_contradiction"].includes(reason)) ||
    value.tier === "measurement" && !value.reasons.includes("storage_denied_measurement") ||
    value.tier === "performance_only" && !value.reasons.includes("verified_performance_only") ||
    new Set(value.requestIds).size !== value.requestIds.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "After-Reject tier must retain its matching evidence and approved deduction." });
  }
});
export type AfterRejectScoringAssessment = z.infer<typeof schema>;
export function readAfterRejectScoringAssessment(value: unknown): AfterRejectScoringAssessment | null {
  const parsed = schema.safeParse(value); return parsed.success ? parsed.data : null;
}

/** WC01 interpretation of the verified original packet projection, prior to persistence. */
export function assessAfterRejectScoring(value: unknown, policyVersion: AfterRejectScoringAssessment["policyVersion"] = AFTER_REJECT_SCORING_POLICY): AfterRejectScoringAssessment | null {
  const parsed = postRefusalReportProjectionSchema.safeParse(value);
  if (!parsed.success) return null;
  const p = parsed.data;
  const confirmed = p.productionProjectable && p.refusalExercised && p.registrationStatus === "confirmed" &&
    p.decisionEvidence?.basis === "verified_state" && p.decisionEvidence.decision === "denied";
  const click = !confirmed && policyVersion === AFTER_REJECT_SCORING_POLICY && p.interactionDiagnostics?.click.outcome === "completed"
    ? assessRejectClickTracking(p) : null;
  const source = p.packetSha256 ?? null;
  const finish = (tier: AfterRejectScoringAssessment["tier"], reasons: AfterRejectScoringAssessment["reasons"], requestIds: string[] = []) => schema.parse({
    policyVersion, sourcePacketSha256: source,
    registration: confirmed ? "confirmed" : p.registrationStatus === "unconfirmed" ? "unconfirmed" : "unknown",
    tier, deductionPoints: POST_REJECT_SCORING_TIERS[tier], requestIds: [...new Set(requestIds)],
    reasons: click ? [...new Set([...reasons, "verified_reject_click"])] : reasons,
  });
  if (!confirmed && !click) return finish("review", [policyVersion === LEGACY_AFTER_REJECT_SCORING_POLICY ? "registration_unconfirmed" : "source_proof_incomplete"]);
  const proof = p.actionControlProof;
  if (!source || !proof?.authorizedTargetSha256 || !proof.frameIdentitySha256 ||
    confirmed && !p.registeredObservationCompletion || p.captureCoverage?.requestsDroppedAfterAction !== 0 ||
    !p.scoringEvidence) return finish("review", ["source_proof_incomplete"]);
  const anchor = confirmed ? p.refusalRegisteredAtMs! : click!.actionDispatchedAtMs;
  const endedAtMs = confirmed ? p.registeredObservationCompletion!.completedAtMs : click!.captureEndedAtMs;
  if (confirmed && p.contradictionObserved) return finish("high_risk", ["verified_contradiction"]);
  const storageWrites = confirmed ? p.scoringEvidence.storageWrites.filter(row => row.nonEssential &&
    row.observedAtMs > p.refusalRegisteredAtMs! && row.observedAtMs <= p.registeredObservationCompletion!.completedAtMs &&
    ["analytics", "advertising", "session_replay"].includes(row.purpose ?? "")) : [];
  if (storageWrites.length) return finish("high_risk", ["verified_optional_activity"]);
  // Score the full retained source set, never the bounded report display sample.
  const afterRefusal = p.scoringEvidence.requests.filter(request => request.startedAtMs > anchor &&
    request.startedAtMs <= endedAtMs && (confirmed ? !request.inFlightAtRefusalRegistration : p.afterActionCapture!.requestIds.includes(request.requestId)) && request.method !== "OPTIONS");
  const requests = afterRefusal.flatMap(request => {
    if (click) {
      const retained = p.afterActionRequests?.find(row => row.requestId === request.requestId);
      const identity = (row: typeof retained) => row && JSON.stringify([row.requestId, row.method, row.sanitizedUrl, row.startedAtMs, row.rootStartedAtMs, row.nonEssential, row.purpose, row.measurementEvidence, row.googleConsentMode, row.completedAtMs, row.responseCookieNamesSet]);
      if (!retained || identity(retained) !== identity(request)) return [];
    }
    const ancestry = click ? p.afterActionCapture!.requestAncestry?.find(row => row.requestId === request.requestId) : undefined;
    const root = click ? ancestry?.rootStartedAtMs : request.rootStartedAtMs;
    if (!["GET", "POST"].includes(request.method ?? "") || root === undefined || root <= anchor || request.startedAtMs < root ||
      (click && request.rootStartedAtMs !== undefined && request.rootStartedAtMs !== root)) return [];
    return [{...request, rootStartedAtMs: root}];
  });
  const captures = [
    { diagnostics: p.storageCollectionDiagnostics?.preAction, items: p.scoringEvidence.preActionStorage },
    { diagnostics: p.storageCollectionDiagnostics?.postAction, items: p.scoringEvidence.postActionStorage },
  ];
  const dispatchedAtMs = p.scoringEvidence.actionDispatchedAtMs;
  const preCapturedAtMs = p.scoringEvidence.preActionCapturedAtMs;
  const postCapturedAtMs = p.scoringEvidence.postActionCapturedAtMs;
  const storageCovered = dispatchedAtMs !== undefined && proof.observedAtMs <= dispatchedAtMs && dispatchedAtMs <= anchor &&
    preCapturedAtMs !== undefined && preCapturedAtMs <= dispatchedAtMs && postCapturedAtMs !== undefined && postCapturedAtMs >= anchor &&
    captures.every(({ diagnostics, items }) => diagnostics &&
      ([[diagnostics.cookies, "cookie"], [diagnostics.localStorage, "local_storage"], [diagnostics.sessionStorage, "session_storage"]] as const)
        .every(([channel, type]) => ["complete", "empty"].includes(channel.status) && channel.droppedCount === 0 &&
          channel.retainedCount === items.filter(item => item.storageType === type).length) &&
      items.every(item => !item.nonEssential && item.purposeAssessment?.essentiality === "essential" && ["consent_management", "security", "infrastructure"].includes(item.purpose ?? "unknown")));
  const unresolvedWrites = p.scoringEvidence.storageWrites.some(row => row.observedAtMs > anchor &&
    row.observedAtMs <= endedAtMs && row.purposeAssessment?.essentiality !== "essential");
  const clickWritesUnresolved = click && p.afterActionCapture!.storageWrites.length > 0;
  let measurement = false, performance = false, uncertain = unresolvedWrites || clickWritesUnresolved || requests.length === 0 || requests.length !== afterRefusal.length;
  for (const request of requests) {
    if (!request.nonEssential && ["consent_management", "security", "infrastructure", "tag_management"].includes(request.purpose ?? "")) continue;
    if (!request.nonEssential) { uncertain = true; continue; }
    if (["advertising", "session_replay"].includes(request.purpose ?? ""))
      return finish("high_risk", ["verified_optional_activity"], [request.requestId]);
    const boundInspection = readBoundMeasurementRequestEvidence(request.measurementEvidence, request, {
      targetSha256: p.actionControlProof?.authorizedTargetSha256,
      actionDispatchedAtMs: p.scoringEvidence.actionDispatchedAtMs,
      preActionCapturedAtMs: p.scoringEvidence.preActionCapturedAtMs, preActionStorage: p.scoringEvidence.preActionStorage,
    });
    const inspection = boundInspection?.profile === "google_analytics_collection.v1" &&
      !isCanonicalGoogleAnalyticsCollectionUrl(request.sanitizedUrl) ? null : boundInspection;
    if (inspection?.identifierEvidence === "persistent_observed")
      return finish("high_risk", ["verified_optional_activity"], [request.requestId]);
    if (!inspection || inspection.payloadInspection !== "complete" || inspection.identifierEvidence !== "not_observed" ||
      inspection.cookieHeader !== "absent" || inspection.authorizationHeader !== "absent" ||
      request.completedAtMs === undefined || postCapturedAtMs === undefined || request.completedAtMs > postCapturedAtMs || request.responseCookieNamesSet === undefined || request.responseCookieNamesSet.length > 0) { uncertain = true; continue; }
    if (!storageCovered || clickWritesUnresolved) { uncertain = true; continue; }
    if (inspection.profile === "cloudflare_rum.v1") performance = true;
    else {
      const mode = assessGoogleConsentModeRequest({ observation: request.googleConsentMode, requestId: request.requestId,
        timestampMs: request.startedAtMs, requestUrl: request.sanitizedUrl });
      if (mode?.storageDeclaration === "denied") measurement = true;
      else uncertain = true;
    }
  }
  const ids = requests.map(request => request.requestId);
  if (measurement) return finish("measurement", ["storage_denied_measurement", ...(uncertain ? ["purpose_or_identifier_unverified" as const] : [])], ids);
  if (performance && !uncertain) return finish("performance_only", ["verified_performance_only"], ids);
  return finish("review", [requests.length ? "purpose_or_identifier_unverified" : "no_eligible_activity",
    ...(!storageCovered ? ["storage_coverage_incomplete" as const] : [])], ids);
}

/** Never accept a stored assessment whose source projection now differs. */
export function retainedAfterRejectScoringAssessment(runtime: Record<string, unknown> | null | undefined) {
  const stored = readAfterRejectScoringAssessment(runtime?.afterRejectScoringAssessment);
  if (!stored) return null;
  const derived = assessAfterRejectScoring(runtime?.postRefusalEvidenceProjection, stored.policyVersion);
  return derived && JSON.stringify(stored) === JSON.stringify(derived) ? stored : null;
}

/** Canonical narrative for an already-admitted observation, never a new finding. */
export function afterRejectScoringNarrative(assessment: AfterRejectScoringAssessment | null | undefined) {
  if (!assessment || assessment.tier === "high_risk") return null;
  if (assessment.tier === "performance_only") return {
    title: "Performance measurement after Reject",
    description: "Page-performance requests were observed after Reject. Inspected payloads and bounded storage evidence supported performance-only measurement.",
    suggestedFix: "Review the disclosed performance-measurement purpose and retained payload/storage evidence. Retest if the integration or data collected changes.",
    whyThisMatters: "Performance measurement was observed. This evidence does not establish optional identifier-based tracking or a failure to enforce refusal.",
  };
  if (assessment.tier === "measurement") return {
    title: "Analytics measurement after Reject",
    description: "Analytics measurement was observed after Reject with denied-storage declarations and no observed persistent identifier transmission in inspected requests.",
    suggestedFix: "Review the measurement purpose, request-level consent declarations, identifier evidence and storage coverage. Confirm that the behavior matches the visitor's choice and the site's disclosure.",
    whyThisMatters: "Measurement continued after Reject. Retained evidence distinguishes it from identifier-based tracking without establishing legal compliance.",
  };
  return {
    title: "Activity after Reject for review",
    description: "Activity was observed after Reject, but retained purpose, identifier or action evidence did not support a purpose-specific deduction.",
    suggestedFix: "Review the recorded requests, action evidence, purposes and storage coverage. Retest unresolved evidence before drawing a conclusion about refusal behavior.",
    whyThisMatters: "Observed requests remain evidence for review. A zero deduction does not establish that refusal was honored or that the site complies with privacy law.",
  };
}
