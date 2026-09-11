import type { CanonicalEvidenceBundle } from "@certscore/contracts";

/** Routing only: uncertainty or passive-only vocabulary must not buy extra
 * action work. Existing independent results remain eligible for verification. */
export function consentActionPassiveBarrierLimits(bundle: CanonicalEvidenceBundle) {
  const latest = [...(bundle.consentUiObservations ?? [])].sort((a, b) => b.observedAtMs - a.observedAtMs)[0];
  const controls = latest?.controls ?? [];
  const uncertain = [...(latest?.basis ?? []), ...(bundle.consentSurfaceInspection?.limitationKeys ?? [])]
    .some((reason) => ["unresolved_visible_consent_decision", "accessibility_control_proof_unverified", "consent_session_access_limited"].includes(reason));
  const passiveOnly = (action: string) => {
    const candidates = controls.filter((control) => control.actionType === action);
    const hasActionCandidate = candidates.some((control) => control.visible !== false &&
      !control.classifierReasonCodes?.includes("observation_only_label") &&
      (control.tagName !== "ax-node" || (control.visibilityEvidence === "box_model_verified" && control.consentContextEvidence === "local_surface")));
    return !hasActionCandidate && (uncertain || candidates.some((control) => control.classifierReasonCodes?.includes("observation_only_label")));
  };
  return {
    ...(passiveOnly("accept_all") ? { acceptPassiveBarrierOnly: true as const } : {}),
    ...(passiveOnly("reject_all") ? { rejectPassiveBarrierOnly: true as const } : {}),
  };
}
