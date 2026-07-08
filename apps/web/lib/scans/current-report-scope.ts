export const NON_GDPR_EPRIVACY_CURRENT_REPORT_FINDING_IDS = new Set([
  "accessibility_risk_score",
  "high_risk_product_risk_disclosure_missing",
  "leveraged_or_high_risk_product_promotion",
  "yield_or_return_claims_high_risk",
  "wcag_issue_summary",
  "contrast_failures",
  "keyboard_navigation_accessibility_issue",
  "semantic_labeling_accessibility_issue",
  "text_alternative_accessibility_issue",
  "visual_contrast_accessibility_issue"
]);

export function isCurrentGdprEprivacyFindingId(findingId: string | null | undefined) {
  return !findingId || !NON_GDPR_EPRIVACY_CURRENT_REPORT_FINDING_IDS.has(findingId);
}

export function isCurrentGdprEprivacyReportFinding(input: {
  family?: string | null;
  id?: string | null;
  section?: string | null;
}) {
  const family = input.family?.trim().toLowerCase() ?? "";
  const section = input.section?.trim().toLowerCase() ?? "";

  if (
    family === "financial_promotion" ||
    family === "accessibility" ||
    section === "accessibility" ||
    section === "financial promotion" ||
    section === "financial promotions" ||
    section === "high-risk product marketing" ||
    section === "high-risk product marketing disclosures"
  ) {
    return false;
  }

  return isCurrentGdprEprivacyFindingId(input.id);
}
