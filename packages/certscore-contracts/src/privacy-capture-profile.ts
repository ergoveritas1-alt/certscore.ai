import { saleSharingOptOutLaneOutcomeSchema, saleSharingOptOutDispatchSchema, SALE_SHARING_OPT_OUT_POLICY, REDHAT_OPT_OUT_POLICY } from "./sale-sharing-opt-out";

/** Six evidence workers at most; the orchestration-only coordinator is separate. */
export const PRESENCE_ONLY_CAPTURE_PROFILE = "presence_only_six_workers.v1" as const;
export const PRESENCE_ONLY_WORKER_LANES = ["consent_proof", "runtime_evidence", "policy_evidence", "gpc_observation", "accept_observation", "reject_observation"] as const;
export const CONDITIONAL_OPT_OUT_CAPTURE_PROFILE = "conditional_opt_out_seven_workers.v1" as const;
export type PrivacyCaptureProfile = typeof PRESENCE_ONLY_CAPTURE_PROFILE | typeof CONDITIONAL_OPT_OUT_CAPTURE_PROFILE;

/** Shared web/durable-publisher opt-in. Existing flags alone preserve six workers. */
export function conditionalOptOutRequested(intent: Record<string, unknown>, env: Record<string, string | undefined>): boolean {
  return intent.orchestrationMode === "sharded" && intent.saleSharingOptOutEnabled === true &&
    intent.saleSharingOptOutRolloutMode === "all_eligible" &&
    env.CERTSCORE_CONDITIONAL_SALE_SHARING_OPT_OUT_ENABLED === "1" && env.CERTSCORE_SALE_SHARING_OPT_OUT_ENABLED === "1";
}

export const OPT_OUT_DISPATCH_STATES = ["excluded_by_profile", "dispatch_recorded", "profile_dispatch_conflict", "conditional_no_dispatch_recorded"] as const;
export type OptOutDispatchState = typeof OPT_OUT_DISPATCH_STATES[number];

/** Only call with facts from the same verified original result. */
export function retainedOptOutDispatch(profile: unknown, laneOutcome: unknown): OptOutDispatchState | undefined {
  const dispatched = saleSharingOptOutLaneOutcomeSchema.safeParse(laneOutcome).success;
  if (profile === PRESENCE_ONLY_CAPTURE_PROFILE) return dispatched ? "profile_dispatch_conflict" : "excluded_by_profile";
  if (profile === CONDITIONAL_OPT_OUT_CAPTURE_PROFILE) return dispatched ? "dispatch_recorded" : "conditional_no_dispatch_recorded";
  return dispatched ? "dispatch_recorded" : undefined;
}

/** Also used before direct invocation so typed/internal callers cannot bypass parsing. */
export function assertPrivacyCaptureProfile(payload: {
  privacyCaptureProfile?: unknown; orchestrationMode?: unknown; workerLane?: unknown;
  cmpPreferenceInspection?: unknown; saleSharingOptOut?: unknown; gpcObservation?: {enabled?: boolean};
}, requestedLane?: string): void {
  if (payload.privacyCaptureProfile === undefined) return; // Historical dispatches retain their contract.
  if (payload.privacyCaptureProfile === CONDITIONAL_OPT_OUT_CAPTURE_PROFILE) {
    if (!["sharded", "worker"].includes(String(payload.orchestrationMode)) || payload.cmpPreferenceInspection !== undefined)
      throw new Error("Conditional opt-out profile requires sharded orchestration and excludes preference workers.");
    const dispatch = saleSharingOptOutDispatchSchema.safeParse(payload.saleSharingOptOut);
    if (!dispatch.success || ![SALE_SHARING_OPT_OUT_POLICY,REDHAT_OPT_OUT_POLICY].includes(dispatch.data.policyVersion as never) || dispatch.data.canaryAuthorization)
      throw new Error("Conditional opt-out profile requires exact-target v1 or source-bound Red Hat v4 authorization; other redirect and Settings grants remain excluded.");
    if (payload.orchestrationMode === "sharded" && payload.gpcObservation?.enabled !== true)
      throw new Error("Conditional opt-out profile requires the independent GPC lane.");
    for (const lane of [payload.workerLane, requestedLane]) if (lane !== undefined && ![...PRESENCE_ONLY_WORKER_LANES, "sale_sharing_opt_out"].includes(lane as never))
      throw new Error("Conditional opt-out profile excludes this worker lane.");
    return;
  }
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
