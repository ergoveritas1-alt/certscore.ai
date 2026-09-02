export const POST_REFUSAL_CANONICAL_BARRIER_MAX_TAIL_WAIT_MS = 8_000;

export type PostRefusalReportPublicationDecision = {
  mode: "single_reconciliation" | "single_reconciliation_limited";
  rejectReadyDeltaMs: number;
  addedInitialReportWaitMs: number;
  reason:
    | "reject_packet_ready_before_primary"
    | "reject_packet_extended_canonical_barrier"
    | "reject_path_exceeded_canonical_barrier";
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
  /** Retained for old calibration callers; the single barrier no longer has a late branch. */
  approvedJoinWaitMs?: number;
  maxTailWaitMs?: number;
}): PostRefusalReportPublicationDecision {
  const primaryReadyAtMs = nonnegativeMs(input.primaryReadyAtMs);
  const rejectReadyAtMs = nonnegativeMs(input.rejectReadyAtMs);
  const maxTailWaitMs = nonnegativeMs(
    input.maxTailWaitMs ?? POST_REFUSAL_CANONICAL_BARRIER_MAX_TAIL_WAIT_MS,
  );
  const rejectReadyDeltaMs = rejectReadyAtMs - primaryReadyAtMs;

  if (rejectReadyDeltaMs <= 0) {
    return {
      mode: "single_reconciliation",
      rejectReadyDeltaMs,
      addedInitialReportWaitMs: 0,
      reason: "reject_packet_ready_before_primary",
    };
  }
  if (rejectReadyDeltaMs > maxTailWaitMs) {
    return {
      mode: "single_reconciliation_limited",
      rejectReadyDeltaMs,
      addedInitialReportWaitMs: maxTailWaitMs,
      reason: "reject_path_exceeded_canonical_barrier",
    };
  }
  return {
    mode: "single_reconciliation",
    rejectReadyDeltaMs,
    addedInitialReportWaitMs: rejectReadyDeltaMs,
    reason: "reject_packet_extended_canonical_barrier",
  };
}

export type PostRefusalCooperativeAbortDecision = {
  abortRequested: boolean;
  reason:
    | "consent_inventory_incomplete"
    | "reject_control_observed"
    | "necessary_only_reject_equivalent_observed"
    | "complete_inventory_without_reject"
    | "reject_action_already_dispatched";
};

export function decidePostRefusalCooperativeAbort(input: {
  consentInventoryComplete: boolean;
  necessaryOnlyRejectEquivalentObserved?: boolean;
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
  if (input.necessaryOnlyRejectEquivalentObserved) {
    return { abortRequested: false, reason: "necessary_only_reject_equivalent_observed" };
  }
  return { abortRequested: true, reason: "complete_inventory_without_reject" };
}

function nonnegativeMs(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.round(value));
}
