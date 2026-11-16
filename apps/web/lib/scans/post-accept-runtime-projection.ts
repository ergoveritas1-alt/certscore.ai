import { readChoicePathExecution, readChoicePathLimitation } from "./choice-path-execution";
import type {
  PostAcceptLaneOutcome,
  PostAcceptReportProjection,
} from "@certscore/contracts";

export const ACCEPT_PATH_DIAGNOSTIC_REASONS = [
  "target_authorization_rejected", "control_unresolved", "control_binding_unverified",
  "click_failed_before_dispatch", "click_failed_after_dispatch", "action_incomplete",
  "lane_not_applicable", "worker_failed", "passive_inspection_cutoff",
  "result_deadline_exceeded", "verified_result_unavailable",
  "target_navigation_failed", "ambiguous_control", "control_search_deadline_exceeded",
  "deferred_consent_not_ready", "dispatch_guard_rejected", "cancelled_before_click",
  "observer_budget_exhausted", "control_proof_deadline_exceeded", "control_scope_not_interactive",
] as const;
type AcceptPathDiagnostic = typeof ACCEPT_PATH_DIAGNOSTIC_REASONS[number];

function retainedAcceptStopReason(
  projection: PostAcceptReportProjection,
  pathLimitation: ReturnType<typeof readChoicePathLimitation>,
): AcceptPathDiagnostic | null {
  const clickOutcome = projection.interactionDiagnostics?.click.outcome;
  if (clickOutcome === "failed_before_dispatch" || clickOutcome === "failed_after_dispatch") {
    return clickOutcome === "failed_before_dispatch" ? "click_failed_before_dispatch" : "click_failed_after_dispatch";
  }
  const resolverReason = projection.resolver?.reason;
  switch (resolverReason) {
    case "redirect_target_not_authorized": return "target_authorization_rejected";
    case "target_navigation_failed": return "target_navigation_failed";
    case "multiple_deterministic_accept_controls_found": return "ambiguous_control";
    case "deterministic_accept_control_not_found":
      if (projection.limitations.includes("resolver_search_budget_exhausted")) return "control_search_deadline_exceeded";
      break;
    case "label_unverifiable":
    case "label_mismatch":
      // The observer records the bounded proof failure separately from its resolver status.
      if (projection.limitations.includes("redirect_target_not_authorized")) return "target_authorization_rejected";
      if (projection.limitations.includes("abort_requested_before_action")) return "cancelled_before_click";
      if (projection.limitations.includes("control_proof_deadline_exhausted")) return "control_proof_deadline_exceeded";
      if (projection.limitations.includes("resolved_control_scope_not_interactive")) return "control_scope_not_interactive";
      return "control_binding_unverified";
    case "deferred_consent_handlers_not_ready": return "deferred_consent_not_ready";
    case "dispatch_guard_failed_before_action": return "dispatch_guard_rejected";
    case "abort_requested_before_navigation":
    case "abort_requested_during_control_resolution":
    case "abort_requested_before_action": return "cancelled_before_click";
    case "observer_result_budget_exhausted_before_navigation":
    case "observer_result_budget_exhausted_before_action":
    case "observer_browser_operation_boundary_exhausted": return "observer_budget_exhausted";
  }
  if (pathLimitation?.code === "control_unresolved" || pathLimitation?.code === "control_binding_unverified" ||
      pathLimitation?.code === "action_incomplete") return pathLimitation.code;
  return null;
}

/**
 * Maps verified post-Accept evidence into the canonical runtime-artifact
 * boundary. This remains presentation-free and deliberately score-neutral.
 */
export function buildPostAcceptRuntimeProjection(
  projection: PostAcceptReportProjection | null,
  laneOutcome?: PostAcceptLaneOutcome | null,
) {
  const pathLimitation = readChoicePathLimitation(projection, "accept", laneOutcome);
  const execution = projection && readChoicePathExecution(projection, "accept");
  let acceptPathDiagnostic: AcceptPathDiagnostic | null = null;
  const clickOutcome = projection?.interactionDiagnostics?.click.outcome;
  const retainedCompletedClick = clickOutcome === "completed" || clickOutcome === "confirmed_after_error" ||
    projection?.afterActionCapture?.activationStatus === "completed";
  if (!execution?.clickCompleted && !retainedCompletedClick) {
    if (!projection) {
      if (laneOutcome?.status === "not_applicable") acceptPathDiagnostic = "lane_not_applicable";
      else if (pathLimitation?.code === "worker_failed" || pathLimitation?.code === "passive_inspection_cutoff" ||
          pathLimitation?.code === "result_deadline_exceeded" || pathLimitation?.code === "verified_result_unavailable") {
        acceptPathDiagnostic = pathLimitation.code;
      }
    } else if (execution) {
      acceptPathDiagnostic = retainedAcceptStopReason(projection, pathLimitation);
    }
  }
  const observationTruncated = projection?.limitations.some((limitation) =>
    limitation === "observation_window_aborted_after_confirmed_acceptance" ||
    limitation === "post_action_network_capture_truncated" ||
    limitation.startsWith("observer_result_budget_exhausted")
  ) === true;
  const coverageProjection = laneOutcome
    ? {
        completedAt: laneOutcome.completedAt,
        pathLimitation,
        evidenceJoined: laneOutcome.evidenceJoined,
        limitationCode: laneOutcome.limitationCode ??
          (observationTruncated ? "accept_observation_window_truncated" : null),
        maxTailWaitMs: laneOutcome.maxTailWaitMs,
        status: laneOutcome.status === "joined"
          ? observationTruncated ? "limited" : "complete"
          : laneOutcome.status === "not_applicable"
            ? "not_applicable"
            : "limited",
      }
    : null;
  if (!projection) {
    return {
      acceptPathDiagnostic,
      ...(coverageProjection ? {
          postAcceptObservationCoverage: coverageProjection,
          post_accept_observation_coverage: coverageProjection,
        } : {}),
    };
  }
  const confirmed = projection.productionProjectable &&
    projection.registrationStatus === "confirmed" &&
    projection.acceptanceExercised;
  const activityRows = confirmed
    ? projection.postAcceptActivity.map((row) => ({
        activityType: row.activityType,
        category: row.category ?? "unknown",
        consentState: row.consentState,
        ...(row.hostname ? { hostname: row.hostname } : {}),
        msAfterAccept: row.msAfterAccept,
        nonEssential: true,
        ...(row.requestId ? { requestId: row.requestId } : {}),
        ...(row.storageIdentityHash ? { storageIdentityHash: row.storageIdentityHash } : {}),
        ...(row.storageName ? { storageName: row.storageName } : {}),
        ...(row.storageType ? { storageType: row.storageType } : {}),
        ...(row.url ? { url: row.url } : {}),
        ...(row.vendor ? { vendor: row.vendor } : {}),
      }))
    : [];
  const behaviorProjection = {
    execution: execution ?? undefined,
    pathLimitation,
    acceptanceInteractionConfirmed: confirmed,
    acceptanceSignalContradictsAction: confirmed && projection.contradictionObserved,
    observationWindowMs: confirmed ? projection.observationWindowMs : null,
    postAcceptActivity: activityRows,
    postAcceptNonEssentialActivityRetained: activityRows.length > 0,
    productionProjectable: projection.productionProjectable,
    reportProjectionContractVersion: projection.contractVersion,
    resolverMethod: projection.resolverMethod,
    scoreEffect: "none" as const,
    ...(projection.packetSha256 ? { sourcePacketSha256: projection.packetSha256 } : {}),
  };
  return {
    acceptPathDiagnostic,
    ...(coverageProjection
      ? {
          postAcceptObservationCoverage: coverageProjection,
          post_accept_observation_coverage: coverageProjection,
        }
      : {}),
    postAcceptEvidenceProjection: projection,
    post_accept_evidence_projection: projection,
    postAcceptBehaviorEvidence: behaviorProjection,
    post_accept_behavior_evidence: behaviorProjection,
  };
}
