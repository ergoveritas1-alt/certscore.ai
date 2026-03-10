import type { FindingSeverity } from "@website-signal-risk-scanner/shared";
import type { DerivedFindingRecord } from "../types/finding";
import { getSeverityWeight, mapAxeImpactToSeverity } from "./map-axe-severity";
import type { NormalizedAxeViolation } from "./normalize-axe-results";

export type AccessibilityFindingInsert = DerivedFindingRecord & {
  category: "accessibility";
  subtype: "axe_rule";
};

function buildRemediationBusiness(ruleTitle: string) {
  return `Address the observed ${ruleTitle.toLowerCase()} issue to reduce potential accessibility barriers for visitors using assistive technology.`;
}

function buildRemediationTechnical(ruleTitle: string, helpUrl: string) {
  return `Review the affected components, apply the recommended markup or styling fix, and validate the result against the axe guidance: ${ruleTitle}. ${helpUrl}`;
}

export function buildAccessibilityFinding(input: {
  pageUrl: string;
  scanId: string;
  scanPageId: string;
  violation: NormalizedAxeViolation;
}): AccessibilityFindingInsert {
  const severity = mapAxeImpactToSeverity(input.violation.impact);

  return {
    scan_id: input.scanId,
    scan_page_id: input.scanPageId,
    category: "accessibility",
    subtype: "axe_rule",
    rule_key: `accessibility.axe.${input.violation.ruleId}`,
    title: input.violation.help,
    description: input.violation.description,
    severity,
    weight: getSeverityWeight(severity),
    status: "open",
    evidence_json: {
      page_url: input.pageUrl,
      axe_rule_id: input.violation.ruleId,
      impact: input.violation.impact,
      help_url: input.violation.helpUrl,
      node_count: input.violation.nodeCount,
      representative_selectors: input.violation.representativeSelectors
    },
    remediation_business: buildRemediationBusiness(input.violation.help),
    remediation_technical: buildRemediationTechnical(input.violation.help, input.violation.helpUrl)
  };
}
