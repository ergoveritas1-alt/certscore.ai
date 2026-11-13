import {
  assessChoicePathExecution,
  postAcceptReportProjectionSchema,
  postRefusalReportProjectionSchema,
  type ChoicePathExecution,
} from "@certscore/contracts";

/** Canonical operational assessment of persisted typed evidence, including v1
 * records. Never changes registration, findings, scoring, or the stored record. */
export function readChoicePathExecution(value: unknown, action: "accept" | "reject"): ChoicePathExecution | undefined {
  const parsed = action === "accept"
    ? postAcceptReportProjectionSchema.safeParse(value)
    : postRefusalReportProjectionSchema.safeParse(value);
  if (!parsed.success) return undefined;
  return parsed.data.execution ?? assessChoicePathExecution(parsed.data, action);
}

/** Display-safe phase diagnosis from validated evidence; never changes execution
 * or interprets an unresolved search as absence of a first-layer control. */
export function readChoicePathLimitation(
  value: unknown,
  action: "accept" | "reject",
  lane?: { status: string; limitationCode?: string | null } | null,
) {
  const label = action === "accept" ? "Accept" : "Reject";
  const parsed = action === "accept"
    ? postAcceptReportProjectionSchema.safeParse(value)
    : postRefusalReportProjectionSchema.safeParse(value);
  if (!parsed.success) {
    if (!lane || lane.status === "not_applicable") return null;
    if (lane.limitationCode === `${action}_path_worker_failed`) {
      return {
        code: "worker_failed" as const,
        message: `The ${label} worker failed before a verified result was retained. Post-${label} behavior was not assessed; initial control inspection is reported separately.`,
      };
    }
    if (lane.limitationCode === `${action}_path_incomplete_at_passive_barrier`) {
      return {
        code: "passive_inspection_cutoff" as const,
        message: `The independent ${label} test was stopped at the initial-inspection cutoff before a verified result was retained. This does not establish whether a control was present or clicked.`,
      };
    }
    if (lane.limitationCode === `${action}_path_timeout`) {
      return {
        code: "result_deadline_exceeded" as const,
        message: `The ${label} test did not deliver a verified result within its existing scan window. Post-${label} behavior was not assessed; initial control inspection is reported separately.`,
      };
    }
    return {
      code: "verified_result_unavailable" as const,
      message: `The ${label} test did not retain a verified result. Post-${label} behavior was not assessed; initial control inspection is reported separately.`,
    };
  }
  const projection = parsed.data;
  const execution = projection.execution ?? assessChoicePathExecution(projection, action);
  if (execution.observationCompleted && execution.consentConfirmed) return null;
  if (execution.observationCompleted) return {
    code: "consent_state_unconfirmed" as const,
    message: `The ${label} click and observation completed, but the consent decision could not be confirmed.`,
  };
  if (execution.clickCompleted) return {
    code: "observation_incomplete" as const,
    message: `The ${label} click completed, but the post-click observation was incomplete.`,
  };
  if (!projection.resolver?.found) return {
    code: "control_unresolved" as const,
    message: `The ${label} action could not resolve a control. This does not establish whether a control was present in the initial inspection.`,
  };
  if (!projection.actionControlProof) return {
    code: "control_binding_unverified" as const,
    message: `A candidate ${label} control was found, but its action binding was not verified.`,
  };
  return {
    code: "action_incomplete" as const,
    message: `The ${label} control was resolved, but a completed click was not verified.`,
  };
}
