export type PostRefusalReportPublicationDecision = {
  mode: "initial_report" | "initial_report_with_bounded_wait" | "late_generation";
  rejectReadyDeltaMs: number;
  addedInitialReportWaitMs: number;
  reason:
    | "reject_packet_ready_before_primary"
    | "reject_packet_ready_inside_approved_join_window"
    | "reject_packet_not_ready_without_delaying_primary";
};

export type PostRefusalLaneTimingComparison = {
  consentProofDeltaMs: number;
  policyEvidenceDeltaMs: number;
  primaryReadyAtMs: number;
  rejectReadyBeforeConsentProof: boolean;
  rejectReadyBeforePrimary: boolean;
  runtimeEvidenceDeltaMs: number;
};

export function comparePostRefusalLaneReadiness(input: {
  laneReadyAtMs: {
    consent_proof: number;
    policy_evidence: number;
    runtime_evidence: number;
  };
  rejectReadyAtMs: number;
}): PostRefusalLaneTimingComparison {
  const consentProofReadyAtMs = nonnegativeMs(input.laneReadyAtMs.consent_proof);
  const policyEvidenceReadyAtMs = nonnegativeMs(input.laneReadyAtMs.policy_evidence);
  const runtimeEvidenceReadyAtMs = nonnegativeMs(input.laneReadyAtMs.runtime_evidence);
  const rejectReadyAtMs = nonnegativeMs(input.rejectReadyAtMs);
  const primaryReadyAtMs = Math.max(
    consentProofReadyAtMs,
    policyEvidenceReadyAtMs,
    runtimeEvidenceReadyAtMs,
  );

  return {
    consentProofDeltaMs: rejectReadyAtMs - consentProofReadyAtMs,
    policyEvidenceDeltaMs: rejectReadyAtMs - policyEvidenceReadyAtMs,
    primaryReadyAtMs,
    rejectReadyBeforeConsentProof: rejectReadyAtMs <= consentProofReadyAtMs,
    rejectReadyBeforePrimary: rejectReadyAtMs <= primaryReadyAtMs,
    runtimeEvidenceDeltaMs: rejectReadyAtMs - runtimeEvidenceReadyAtMs,
  };
}

export function decidePostRefusalReportPublication(input: {
  primaryReadyAtMs: number;
  rejectReadyAtMs: number;
  approvedJoinWaitMs?: number;
}): PostRefusalReportPublicationDecision {
  const primaryReadyAtMs = nonnegativeMs(input.primaryReadyAtMs);
  const rejectReadyAtMs = nonnegativeMs(input.rejectReadyAtMs);
  const approvedJoinWaitMs = nonnegativeMs(input.approvedJoinWaitMs ?? 0);
  const rejectReadyDeltaMs = rejectReadyAtMs - primaryReadyAtMs;

  if (rejectReadyDeltaMs <= 0) {
    return {
      mode: "initial_report",
      rejectReadyDeltaMs,
      addedInitialReportWaitMs: 0,
      reason: "reject_packet_ready_before_primary",
    };
  }
  if (rejectReadyDeltaMs <= approvedJoinWaitMs) {
    return {
      mode: "initial_report_with_bounded_wait",
      rejectReadyDeltaMs,
      addedInitialReportWaitMs: rejectReadyDeltaMs,
      reason: "reject_packet_ready_inside_approved_join_window",
    };
  }
  return {
    mode: "late_generation",
    rejectReadyDeltaMs,
    addedInitialReportWaitMs: 0,
    reason: "reject_packet_not_ready_without_delaying_primary",
  };
}

export type PostRefusalCooperativeAbortDecision = {
  abortRequested: boolean;
  reason:
    | "consent_inventory_incomplete"
    | "reject_control_observed"
    | "complete_inventory_without_reject"
    | "reject_action_already_dispatched";
};

export function decidePostRefusalCooperativeAbort(input: {
  consentInventoryComplete: boolean;
  rejectControlObserved: boolean;
  rejectActionDispatched: boolean;
}): PostRefusalCooperativeAbortDecision {
  if (input.rejectActionDispatched) {
    return { abortRequested: false, reason: "reject_action_already_dispatched" };
  }
  if (!input.consentInventoryComplete) {
    return { abortRequested: false, reason: "consent_inventory_incomplete" };
  }
  if (input.rejectControlObserved) {
    return { abortRequested: false, reason: "reject_control_observed" };
  }
  return { abortRequested: true, reason: "complete_inventory_without_reject" };
}

function nonnegativeMs(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.round(value));
}
