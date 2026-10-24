/** Six evidence workers at most; the orchestration-only coordinator is separate. */
export const PRESENCE_ONLY_CAPTURE_PROFILE = "presence_only_six_workers.v1" as const;
export const PRESENCE_ONLY_WORKER_LANES = ["consent_proof", "runtime_evidence", "policy_evidence", "gpc_observation", "accept_observation", "reject_observation"] as const;

/** Also used before direct invocation so typed/internal callers cannot bypass parsing. */
export function assertPrivacyCaptureProfile(payload: {
  privacyCaptureProfile?: unknown; orchestrationMode?: unknown; workerLane?: unknown;
  cmpPreferenceInspection?: unknown; saleSharingOptOut?: unknown; gpcObservation?: {enabled?: boolean};
}, requestedLane?: string): void {
  if (payload.privacyCaptureProfile === undefined) return; // Historical dispatches retain their contract.
  if (payload.privacyCaptureProfile !== PRESENCE_ONLY_CAPTURE_PROFILE) throw new Error("Unsupported privacy capture profile.");
  if (!["sharded", "worker"].includes(String(payload.orchestrationMode))) throw new Error("Presence-only capture requires sharded orchestration.");
  if (payload.cmpPreferenceInspection !== undefined || payload.saleSharingOptOut !== undefined)
    throw new Error("Presence-only capture excludes optional privacy workers.");
  if (payload.orchestrationMode === "sharded" && payload.gpcObservation?.enabled !== true)
    throw new Error("Presence-only capture requires the independent GPC lane.");
  for (const lane of [payload.workerLane, requestedLane]) {
    if (lane !== undefined && !(PRESENCE_ONLY_WORKER_LANES as readonly unknown[]).includes(lane))
      throw new Error("Presence-only capture excludes this worker lane.");
  }
}
