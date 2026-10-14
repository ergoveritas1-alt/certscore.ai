import { EVIDENCE_SECTION_TITLES } from "./detailed-evidence-presentation";
import type { AccessibilityRuleObservation } from "@certscore/contracts";
import type { ApiAccessibilityAuditSummary } from "@certscore/api-contracts";

export const ACCESSIBILITY_REPORT_LABEL = EVIDENCE_SECTION_TITLES.accessibility;

/** Short display labels only; retained rule identities and assessments are unchanged. */
const RULE_TITLES: Record<string, string> = {
  "color-contrast": "Low text contrast",
  "image-alt": "Image text alternatives",
  "input-image-alt": "Image button labels",
  "link-name": "Link names",
  "button-name": "Button names",
  "label": "Form field labels",
  "meta-viewport": "Zoom restrictions",
  "target-size": "Touch target size and spacing",
  "autocomplete-valid": "Field autocomplete settings",
  "area-alt": "Image map labels",
  "aria-allowed-attr": "Unsupported ARIA attributes",
  "aria-braille-equivalent": "Braille label equivalents",
  "aria-command-name": "ARIA command names",
  "aria-conditional-attr": "ARIA attribute requirements",
  "aria-deprecated-role": "Deprecated ARIA roles",
  "aria-hidden-body": "Hidden page body",
  "aria-hidden-focus": "Hidden content and keyboard focus",
  "aria-input-field-name": "ARIA field labels",
  "aria-meter-name": "Meter labels",
  "aria-progressbar-name": "Progress indicator labels",
  "aria-prohibited-attr": "Prohibited ARIA attributes",
  "aria-required-attr": "Required ARIA attributes",
  "aria-required-children": "Required ARIA child roles",
  "aria-required-parent": "Required ARIA parent roles",
  "aria-roledescription": "Custom role descriptions",
  "aria-roles": "Invalid ARIA roles",
  "aria-toggle-field-name": "Toggle labels",
  "aria-tooltip-name": "Tooltip names",
  "aria-valid-attr-value": "Invalid ARIA values",
  "aria-valid-attr": "Invalid ARIA attribute names",
  "audio-caption": "Audio captions",
  "avoid-inline-spacing": "Adjustable text spacing",
  "blink": "Blinking text",
  "bypass": "Skipping repeated navigation",
  "css-orientation-lock": "Screen orientation restrictions",
  "definition-list": "Description list structure",
  "dlitem": "Description list item placement",
  "document-title": "Page title",
  "duplicate-id-aria": "Duplicate label and ARIA IDs",
  "form-field-multiple-labels": "Multiple field labels",
  "frame-focusable-content": "Keyboard access to frames",
  "frame-title-unique": "Distinct frame titles",
  "frame-title": "Frame names",
  "html-has-lang": "Page language declaration",
  "html-lang-valid": "Valid page language",
  "html-xml-lang-mismatch": "Conflicting language declarations",
  "input-button-name": "Input button names",
  "label-content-name-mismatch": "Visible and accessible label match",
  "link-in-text-block": "Links distinguished from text",
  "list": "List structure",
  "listitem": "List item placement",
  "marquee": "Scrolling text",
  "meta-refresh": "Timed page refresh",
  "nested-interactive": "Nested interactive controls",
  "no-autoplay-audio": "Audio autoplay controls",
  "object-alt": "Embedded object alternatives",
  "p-as-heading": "Heading markup",
  "role-img-alt": "ARIA image alternatives",
  "scrollable-region-focusable": "Keyboard access to scrolling",
  "select-name": "Dropdown labels",
  "server-side-image-map": "Server-side image maps",
  "summary-name": "Disclosure control names",
  "svg-img-alt": "SVG text alternatives",
  "table-fake-caption": "Table caption markup",
  "td-has-header": "Data cell header associations",
  "td-headers-attr": "Table header references",
  "th-has-data-cells": "Headers linked to data cells",
  "valid-lang": "Valid content language",
  "video-caption": "Video captions",
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
