import { privacyAuditEvidenceSchema, type ReportReviewFocus } from "@certscore/api-contracts";

export const REVIEW_FOCUS_LABELS = { gdpr_eprivacy: "GDPR/ePrivacy", ccpa_cpra: "CCPA/CPRA" } as const;
function normalizedOrigin(value: unknown) {
  // Older retained report fixtures used display codes instead of API values.
  if (value === "EU-DE") return "eu_de";
  if (value === "EU-IR" || value === "EU-IE") return "eu_ie";
  if (value === "CA") return "california";
  return value;
}
export function resolveReportReviewFocus(value: unknown, scanFrom: unknown): ReportReviewFocus {
  return value === "gdpr_eprivacy" || value === "ccpa_cpra" ? value
    : normalizedOrigin(scanFrom) === "california" ? "ccpa_cpra" : "gdpr_eprivacy";
}
export function reviewFocusScopeNote(focus: ReportReviewFocus, scanFrom: unknown) {
  scanFrom = normalizedOrigin(scanFrom);
  const origin = scanFrom === "california" ? "California" : scanFrom === "eu_de" ? "Germany" : scanFrom === "eu_ie" ? "Ireland" : "an unverified origin";
  const mismatch = (focus === "ccpa_cpra" && scanFrom !== "california") || (focus === "gdpr_eprivacy" && !["eu_de", "eu_ie"].includes(String(scanFrom)));
  return `Observed from ${origin}. ${mismatch ? `${focus === "ccpa_cpra" ? "California" : "EU"} visitor behavior was not tested by this scan. ` : ""}Changing review focus uses the same evidence and does not run another scan.`;
}
export function reportUrlWithFocus(value: string, focus: ReportReviewFocus) {
  const url = new URL(value, "https://certscore.ai");
  url.searchParams.set("reviewFocus", focus);
  return value.startsWith("/") ? `${url.pathname}${url.search}${url.hash}` : url.toString();
}
export function readPrivacyAuditEvidence(runtime: unknown, scanId: string) {
  const value = runtime && typeof runtime === "object" ? (runtime as Record<string, unknown>).privacyAuditEvidence : undefined;
  const parsed = privacyAuditEvidenceSchema.safeParse(value);
  return parsed.success && parsed.data.scanId === scanId ? parsed.data : null;
}
