import { normalizeConsentControlText, type CanonicalEvidenceBundle } from "@certscore/contracts";
import { KNOWN_CMP_REGISTRY } from "@website-signal-risk-scanner/shared";
import { geometryCaptureTimingValid } from "@certscore/scan-core/consent-control-comparison-pair";
import type { ConsentControlGeometryArtifact } from "@certscore/scan-core/consent-control-geometry";

/** New same-session geometry may identify an already-authorized named recipe.
 * This routes the existing tail only; the action worker still proves its own
 * live banner/control, target, uniqueness, hit test and semantic registration. */
function namedRejectCanUseExistingTail(bundle: CanonicalEvidenceBundle, geometry?: ConsentControlGeometryArtifact) {
  try {
    const latest = [...bundle.consentUiObservations].sort((a, b) => b.observedAtMs - a.observedAtMs)[0];
    if (!geometry || geometry.artifactVersion !== "consent_control_geometry.v1" ||
        geometry.sourceScanner !== "consent_control_geometry_diagnostic" || !geometryCaptureTimingValid(geometry) ||
        !geometry.captureTiming || geometry.pageUrl !== bundle.url || latest?.documentUrl !== geometry.pageUrl ||
        geometry.documentIdentity?.source !== "cdp_loader_id" || !geometry.documentIdentity.token || latest.documentIdentity?.source !== geometry.documentIdentity.source ||
        latest.documentIdentity.token !== geometry.documentIdentity.token || latest.captureStatus !== "observed" ||
        latest.layerInspected !== "first_layer" ||
        geometry.controlInspection?.captureCoverage.mainFrameAvailable !== true ||
        geometry.controlInspection.captureCoverage.documentAndFramesStable !== true ||
        !Number.isFinite(Date.parse(bundle.startedAt)) || !Number.isFinite(latest.observedAtMs) ||
        Math.abs(Date.parse(geometry.capturedAt) - Date.parse(bundle.startedAt) - latest.observedAtMs) > 500) return false;
    const candidates = geometry.candidates.filter(row => row.actionType === "reject_all" && row.decisionStatus === "confirmed_visible");
    if (candidates.length !== 1) return false;
    const candidate = candidates[0]!;
    const proof = candidate.namedRejectRouting;
    const definition = KNOWN_CMP_REGISTRY.find(row => row.canonicalName === proof?.provider);
    const recipe = definition?.rejectLabelBoundNecessaryOnly;
    return Boolean(proof?.version === "named_reject_routing.v1" && recipe &&
      geometry.cmp.name === definition!.canonicalName &&
      proof.policyVersion === recipe.policyVersion && proof.bannerSelector === recipe.bannerSelector &&
      proof.controlSelector === recipe.controlSelector && candidate.selectorHint === recipe.controlSelector &&
      recipe.expectedNormalizedLabels.includes(normalizeConsentControlText(candidate.label)) &&
      candidate.tagName === "button" && candidate.enabled === true && candidate.intersectsViewport === true &&
      candidate.layer === "first_layer" && candidate.frameContext.frameKind === "main_frame" &&
      candidate.frameContext.frameUrl === geometry.pageUrl && candidate.consentContextConfirmed === true &&
      latest.controls.filter(row => row.actionType === "reject_all" && row.visible !== false).length === 1 &&
      latest.controls.some(row => row.actionType === "reject_all" && row.visible === true && row.tagName === "button" &&
        row.selectorHint === recipe.controlSelector && normalizeConsentControlText(row.label) === normalizeConsentControlText(candidate.label)));
  } catch { return false; }
}

/** Routing only: uncertainty or passive-only vocabulary must not buy extra
 * action work. Existing independent results remain eligible for verification. */
export function consentActionPassiveBarrierLimits(bundle: CanonicalEvidenceBundle, geometry?: ConsentControlGeometryArtifact) {
  const latest = [...(bundle.consentUiObservations ?? [])].sort((a, b) => b.observedAtMs - a.observedAtMs)[0];
  const controls = latest?.controls ?? [];
  const uncertain = [...(latest?.basis ?? []), ...(bundle.consentSurfaceInspection?.limitationKeys ?? [])]
    .some((reason) => ["unresolved_visible_consent_decision", "accessibility_control_proof_unverified", "consent_session_access_limited"].includes(reason));
  const passiveOnly = (action: string) => {
    const candidates = controls.filter((control) => control.actionType === action);
    const hasActionCandidate = candidates.some((control) => control.visible !== false &&
      !control.classifierReasonCodes?.includes("observation_only_label") &&
      (control.tagName !== "ax-node" || (control.visibilityEvidence === "box_model_verified" && control.consentContextEvidence === "local_surface")));
    if (action === "reject_all" && namedRejectCanUseExistingTail(bundle, geometry)) return false;
    return !hasActionCandidate && (uncertain || candidates.some((control) => control.classifierReasonCodes?.includes("observation_only_label")));
  };
  return {
    ...(passiveOnly("accept_all") ? { acceptPassiveBarrierOnly: true as const } : {}),
    ...(passiveOnly("reject_all") ? { rejectPassiveBarrierOnly: true as const } : {}),
  };
}
