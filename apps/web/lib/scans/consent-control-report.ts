import { consentControlAssessmentSchema } from "@certscore/contracts";

export const CONSENT_CONTROL_REPORT_POLICY = "observed_control_report.v2" as const;
export type ConsentControlReport = {
  policyVersion: typeof CONSENT_CONTROL_REPORT_POLICY;
  scanId: string;
  assessmentVersion: string;
  sourceHash: string;
  controls: Record<"accept" | "reject" | "options", "observed" | "not_observed">;
};

// These describe an unusable consent visit, not an unresolved control meaning.
const UNUSABLE_VISIT = new Set([
  "assessment_blocked", "scan_no_go", "scan_no_go_assessment", "scan_no_go_corroborated",
  "blank_or_unusable_page", "captcha_or_challenge", "potential_security_challenge",
  "access_denied_or_forbidden_page", "consent_session_access_limited",
  "navigation_transport_failure", "navigation_error", "loading_or_stalled",
]);

/** Versioned report projection of a retained assessment. Not observed means the
 * control was not identified in this visit. It is NOT verified absence and must
 * never be consumed by scoring, findings, or interaction authorization. */
export function projectConsentControlReport(value: unknown, expectedScanId?: string): ConsentControlReport | null {
  const parsed = consentControlAssessmentSchema.safeParse(value);
  if (!parsed.success) return null;
  const a = parsed.data;
  if (expectedScanId && a.scan.scanId !== expectedScanId) return null;
  const reasons = [...a.document.reasonCodes, ...a.coverage.reasonCodes, ...a.limitations.map(l => l.code),
    ...Object.values(a.controls).flatMap(c => c.reasonCodes)];
  if (a.scan.noGo || a.document.identityStatus !== "matched" || reasons.some(r => UNUSABLE_VISIT.has(r))) return null;
  // A usable, document-bound limited visit still reports what was identified.
  // Overall inspection completeness and surface uncertainty must not hide the
  // binary summary or upgrade the underlying unknown states into proven absence.
  if (a.coverage.status === "none" || a.coverage.status === "not_applicable") return null;
  const state = (key: "accept" | "reject" | "options") =>
    a.controls[key].state === "observed" ? "observed" as const : "not_observed" as const;
  return {
    policyVersion: CONSENT_CONTROL_REPORT_POLICY, scanId: a.scan.scanId,
    assessmentVersion: a.artifactVersion, sourceHash: a.provenance.sourceHash,
    controls: { accept: state("accept"), reject: state("reject"), options: state("options") },
  };
}

export function consentControlReportLabels(report: ConsentControlReport | null) {
  const label = (key: "accept" | "reject" | "options") => !report ? "" :
    report.controls[key] === "observed" ? "Observed" : "Not observed";
  return { accept: label("accept"), reject: label("reject"), options: label("options") };
}
