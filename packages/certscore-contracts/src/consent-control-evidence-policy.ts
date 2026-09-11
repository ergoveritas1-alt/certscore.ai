/** Pure, bounded interpretation of retained structural facts. No browser or model work. */
export const CONSENT_CONTROL_CAPTURE_POLICY_VERSION = "consent-control-capture.v2";
export const UNRESOLVED_CONSENT_DECISION = "unresolved_visible_consent_decision";

type RecordLike = Record<string, unknown>;
const record = (value: unknown): RecordLike => value && typeof value === "object" && !Array.isArray(value) ? value as RecordLike : {};

export function hasPositiveControlBox(value: unknown): boolean {
  const box = record(value);
  return typeof box.width === "number" && Number.isFinite(box.width) && box.width > 0 &&
    typeof box.height === "number" && Number.isFinite(box.height) && box.height > 0;
}

/** A missing classifier match must not turn a visible decision button into absence.
 * Dismissals, policy links and unrelated page controls do not limit the inventory. */
export function hasUnresolvedConsentDecision(geometry: unknown): boolean {
  const packet = record(geometry);
  const candidates = Array.isArray(packet.candidates) ? packet.candidates : [];
  if (candidates.length > 160) return true; // Uninspected overflow cannot prove absence.
  return candidates.slice(0, 160).some((value) => {
    const candidate = record(value);
    if (candidate.semanticRole === "dismiss" ||
      (Array.isArray(candidate.classifierReasonCodes) && candidate.classifierReasonCodes.includes("matched_dismiss"))) return false;
    const nativeDecision = candidate.tagName === "button" || candidate.tagName === "input" || candidate.role === "button";
    const ambiguousInformationControl = Array.isArray(candidate.classifierReasonCodes) &&
      (candidate.classifierReasonCodes.includes("ambiguous_information_control") ||
        candidate.classifierReasonCodes.includes("unverified_preferences_navigation"));
    return (nativeDecision || ambiguousInformationControl) && candidate.actionType === "other" && candidate.decisionStatus === "ambiguous" &&
      candidate.layer === "first_layer" && candidate.consentContextConfirmed === true &&
      candidate.enabled === true && candidate.intersectsViewport === true && hasPositiveControlBox(candidate.boundingBox);
  });
}

/** Access failure belongs to the consent session even when another lane succeeds. */
export function consentSessionAccessLimited(bundle: unknown, geometry?: unknown): boolean {
  const retained = record(bundle);
  const noGo = record(retained.scanNoGoAssessment ?? retained.scan_no_go_assessment);
  const signals = record(noGo.supportingSignals);
  const access = record(record(geometry).access);
  const pageUrl = record(geometry).pageUrl;
  if (typeof pageUrl === "string" && pageUrl.length > 0) {
    try { if (!["http:", "https:"].includes(new URL(pageUrl).protocol)) return true; } catch { return true; }
  }
  const status = typeof access.httpStatus === "number" ? access.httpStatus : 0;
  return (signals.noGoLane === "consent_proof" && signals.visualHardNoGoPageState === true) ||
    ["access_no_go", "navigation_error", "timeout", "rate_limited_or_security_challenge"].includes(String(access.status)) || status >= 400;
}
