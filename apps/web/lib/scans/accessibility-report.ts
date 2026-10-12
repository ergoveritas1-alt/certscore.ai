import type { AccessibilityRuleObservation } from "@certscore/contracts";
import type { ApiAccessibilityAuditSummary } from "@certscore/api-contracts";

export const ACCESSIBILITY_REPORT_LABEL = "Accessibility (WCAG)";

const RULE_TITLES: Record<string, string> = {
  "color-contrast": "Low text contrast",
  "image-alt": "Images missing alternative text",
  "input-image-alt": "Image buttons missing alternative text",
  "link-name": "Links without accessible names",
  "button-name": "Buttons without accessible names",
  "label": "Form fields without labels",
  "meta-viewport": "Zooming restricted",
  "target-size": "Small or closely spaced touch targets",
  "autocomplete-valid": "Invalid field autocomplete settings",
};

export function accessibilityRuleTitle(rule: AccessibilityRuleObservation) {
  return RULE_TITLES[rule.ruleId] ?? rule.help;
}

/** Rule impact describes the retained automated check, not a legal or scoring severity. */
export function accessibilityImpactLabel(impact: AccessibilityRuleObservation["impact"]) {
  return impact === "critical" ? "Critical" : impact === "serious" ? "Serious"
    : impact === "moderate" ? "Moderate" : impact === "minor" ? "Minor" : "Not rated";
}

export function accessibilityIssueCountLabel(audit: ApiAccessibilityAuditSummary) {
  return audit.failedRuleCount === null ? "Not evaluated"
    : `${audit.failedRuleCount} ${audit.failedRuleCount === 1 ? "issue" : "issues"}`;
}

export function accessibilityOverviewCopy(audit?: ApiAccessibilityAuditSummary | null) {
  if (!audit) return null;
  if (audit.failedRuleCount === null) return "Automated accessibility results were unavailable.";
  const result = audit.failedRuleCount > 0
    ? `Automated WCAG checks also found ${audit.failedRuleCount} accessibility ${audit.failedRuleCount === 1 ? "issue" : "issues"} on the starting page.`
    : "No failures were detected in the evaluated WCAG checks.";
  return `${result}${audit.failedRuleCount === 0 && audit.reviewRuleCount ? ` ${audit.reviewRuleCount} further ${audit.reviewRuleCount === 1 ? "check needs" : "checks need"} manual review.` : ""}`;
}
