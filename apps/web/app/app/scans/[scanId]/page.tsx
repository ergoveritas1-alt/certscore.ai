import Link from "next/link";
import { notFound } from "next/navigation";
import type { PlanCode } from "@website-signal-risk-scanner/shared";
import {
  REPORT_PRIMARY_PILLARS,
  getReportEvidenceCategoriesForSection,
  getReportSectionsForPillar,
  getReportSignalsForEvidenceCategory,
  getReportUnifiedFindingByAlias,
  getReportUnifiedFindingForValidationRule,
  type PreviewSampleFinding,
  type ReportSignalDefinition
} from "@website-signal-risk-scanner/shared";
import { Badge } from "@website-signal-risk-scanner/ui";
import { CollapsibleSectionCard } from "../../../../components/scans/collapsible-section-card";
import { InfoTip } from "../../../../components/scans/info-tip";
import { ReportExecutiveSummary } from "../../../../components/scans/report-executive-summary";
import {
  EMPHASIS_METRIC_CARD_CLASS,
  EMPHASIS_METRIC_CARD_VALUE_CLASS,
  METRIC_CARD_CLASS,
  METRIC_CARD_VALUE_CLASS,
  METRIC_GRID_CLASS,
  SectionSubsection,
  StaticSubsection,
  SummaryMetricTile
} from "../../../../components/scans/report-primitives";
import { ScanViewActions } from "../../../../components/scans/scan-view-actions";
import { ScanStatusAutoRefresh } from "../../../../components/scans/scan-status-auto-refresh";
import {
  isRightsFrictionSignal,
  shouldSurfacePrimarySignalFinding
} from "../../../../lib/scans/finding-evidence-gates";
import {
  buildUnifiedFindingDisplayPackets,
  getUnifiedFindingCategoryRelation,
  type UnifiedFindingDisplayPacket
} from "../../../../lib/scans/unified-findings";
import {
  buildValidationFindingLookup,
  findValidationFindingForKeys,
  getValidationMatchKeysForReviewReason,
  getValidationMatchKeysForSignal,
  getValidationMatchKeysForTitle,
  type ScanValidationFinding
} from "../../../../lib/scans/validation-review-linking";
import {
  groupSnapshotFieldsByPrimaryCategory,
  PRIMARY_SCAN_CATEGORY_META
} from "../../../../lib/scans/signal-taxonomy";
import { getRescanAvailability } from "../../../../lib/scans/rescan-policy";
import { deriveScanExecutionSummary } from "../../../../lib/scans/scan-timeout-summary";
import {
  formatCollectionEndpointType,
} from "../../../../lib/scans/tracker-risk";
import { getDashboardContext } from "../../../../server/auth";
import { getScanById } from "../../../../server/scans/get-scan-by-id";

function formatDateTime(value: string | null) {
  if (!value) {
    return "Not available";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
    timeZoneName: "short"
  }).format(new Date(value));
}

function formatStatus(status: string) {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function formatRescanCooldownMessage(value: string | null, planCode: PlanCode) {
  if (!value) {
    return "This domain cannot be re-scanned yet.";
  }

  return `Next re-scan available ${formatDateTime(value)} for this ${
    planCode === "free" ? "Free" : planCode === "pro" ? "Pro" : "Ultra"
  } plan domain.`;
}

function formatValue(value: unknown) {
  if (value === null || value === undefined) {
    return "Not observed";
  }

  if (Array.isArray(value)) {
    return value.length > 0 ? value.join(", ") : "[]";
  }

  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }

  return String(value);
}

function formatCompactValue(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return "Not observed";
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return "Not observed";
    }

    if (value.length <= 3) {
      return value.join(", ");
    }

    return `${value.slice(0, 3).join(", ")} +${value.length - 3} more`;
  }

  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }

  return String(value);
}

function getFiniteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function formatRating(value: unknown) {
  const numericValue = getFiniteNumber(value);

  if (numericValue === null) {
    return "—";
  }

  const clamped = Math.min(100, Math.max(0, numericValue));
  const rating = Math.round((clamped / 20) * 10) / 10;
  return `${rating.toFixed(1)}/5`;
}

function averageNumbers(values: Array<number | null | undefined>) {
  const filtered = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (filtered.length === 0) {
    return null;
  }

  return filtered.reduce((sum, value) => sum + value, 0) / filtered.length;
}

function invertRiskScore(value: unknown) {
  const numericValue = getFiniteNumber(value);
  if (numericValue === null) {
    return null;
  }

  return Math.min(100, Math.max(0, 100 - numericValue));
}

function derivePreconsentSectionScore(input: {
  consentAuditCompleted: boolean;
  consentRejectReducedTracking: unknown;
  preConsentTrackingObserved: boolean;
  preconsentViolationCount: number | null;
}) {
  let score = 100;

  if (input.preConsentTrackingObserved) {
    score -= 35;
  }

  const violationCount = input.preconsentViolationCount ?? 0;
  if (violationCount > 0) {
    score -= Math.min(35, violationCount * 12);
  }

  if (input.consentAuditCompleted && input.consentRejectReducedTracking === false) {
    score -= 15;
  }

  return Math.min(100, Math.max(0, score));
}

function getSnapshotNumber(snapshot: Record<string, unknown>, key: string) {
  const value = snapshot[key];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function getSnapshotBoolean(snapshot: Record<string, unknown>, key: string) {
  return snapshot[key] === true;
}

function getRecordBoolean(record: Record<string, unknown> | null | undefined, key: string) {
  return record?.[key] === true;
}

function getRecordNumber(record: Record<string, unknown> | null | undefined, key: string) {
  const value = record?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function getRecordStringArray(record: Record<string, unknown> | null | undefined, key: string) {
  const value = record?.[key];
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

function getPolicyField(record: Record<string, unknown> | null | undefined, ...keys: string[]) {
  if (!record) {
    return null;
  }

  for (const key of keys) {
    if (key in record) {
      return record[key];
    }
  }

  return null;
}

type PolicyBehaviorContradiction = {
  claim: string;
  evidence: string[];
  observedBehavior: string;
  severity: "high" | "medium";
  status: "contradiction" | "violation risk" | "likely contradiction";
  title: string;
};

function deriveConsentAuditFindings(
  snapshot: Record<string, unknown> | null,
  runtimeArtifacts: Record<string, unknown> | null
) {
  if (!getRecordBoolean(runtimeArtifacts, "consent_audit_completed")) {
    return [] as PreviewSampleFinding[];
  }

  const findings: PreviewSampleFinding[] = [];
  const rejectWorked = getRecordBoolean(runtimeArtifacts, "consent_reject_interaction_succeeded");
  const acceptWorked = getRecordBoolean(runtimeArtifacts, "consent_accept_interaction_succeeded");
  const rejectReducedTracking = runtimeArtifacts?.consent_reject_reduced_tracking;
  const rejectReducedThirdPartyCookies = runtimeArtifacts?.consent_reject_reduced_third_party_cookies;
  const baselineTrackerVendors = getRecordStringArray(runtimeArtifacts, "consent_baseline_tracker_vendor_names");
  const baselineTrackerEvidenceUrls = getRecordStringArray(runtimeArtifacts, "consent_baseline_tracker_evidence_urls");
  const postRejectTrackerVendors = getRecordStringArray(runtimeArtifacts, "consent_post_reject_tracker_vendor_names");
  const rejectPersistedTrackerVendors = getRecordStringArray(runtimeArtifacts, "consent_reject_persisted_tracker_vendor_names");
  const rejectNewTrackerVendors = getRecordStringArray(runtimeArtifacts, "consent_reject_new_tracker_vendor_names");

  if ((getRecordNumber(runtimeArtifacts, "consent_preconsent_violation_count") ?? 0) > 0) {
    findings.push({
      affectedPage: "Homepage",
      category: "privacy",
      severity: "high",
      title: "Trackers fired before consent interaction",
      description:
        baselineTrackerVendors.length > 0
          ? baselineTrackerEvidenceUrls.length > 0
            ? `The first page render triggered tracker vendors before consent interaction: ${baselineTrackerVendors.join(", ")}. Evidence URLs were captured for ${baselineTrackerEvidenceUrls.length} request${baselineTrackerEvidenceUrls.length === 1 ? "" : "s"}.`
            : `The first page render triggered tracker vendors before consent interaction: ${baselineTrackerVendors.join(", ")}.`
          : "The first page render triggered tracking activity before a consent interaction was completed."
    });
  }

  if (rejectWorked && rejectReducedTracking === false) {
    findings.push({
      affectedPage: "Homepage",
      category: "privacy",
      severity: "high",
      title: "Reject interaction did not reduce tracking",
      description:
        rejectNewTrackerVendors.length > 0
          ? `The consent audit completed a reject interaction, but new tracker vendors still appeared after rejection: ${rejectNewTrackerVendors.join(", ")}.`
          : rejectPersistedTrackerVendors.length > 0
            ? `The consent audit completed a reject interaction, but these tracker vendors still remained after rejection: ${rejectPersistedTrackerVendors.join(", ")}.`
            : postRejectTrackerVendors.length > baselineTrackerVendors.length
              ? `The consent audit completed a reject interaction, but tracking vendors increased from ${baselineTrackerVendors.length} to ${postRejectTrackerVendors.length} after rejection.`
              : "The consent audit completed a reject interaction, but tracking activity still remained after rejection."
    });
  }

  if (rejectWorked && rejectReducedThirdPartyCookies === false) {
    const baselineCookieCount = getRecordNumber(runtimeArtifacts, "consent_baseline_third_party_cookie_count");
    const postRejectCookieCount = getRecordNumber(runtimeArtifacts, "consent_post_reject_third_party_cookie_count");

    findings.push({
      affectedPage: "Homepage",
      category: "privacy",
      severity: "medium",
      title: "Reject interaction did not reduce third-party cookies",
      description:
        baselineCookieCount !== null && postRejectCookieCount !== null
          ? `Third-party cookies changed from ${baselineCookieCount} before interaction to ${postRejectCookieCount} after reject, indicating reject did not suppress that cookie activity.`
          : "Third-party cookie activity was still present after the reject interaction completed."
    });
  }

  if (!getSnapshotBoolean(snapshot ?? {}, "cookie_banner_present") && rejectWorked) {
    findings.push({
      affectedPage: "Homepage",
      category: "privacy",
      severity: "medium",
      title: "Consent surface required deeper interaction sweep",
      description:
        "The initial homepage pass did not surface a banner clearly, but the consent interaction audit later found and used a working consent control."
    });
  }

  if (rejectWorked && acceptWorked === false) {
    findings.push({
      affectedPage: "Homepage",
      category: "privacy",
      severity: "low",
      title: "Accept flow was unavailable after reject in-session",
      description:
        "The audit could complete a reject interaction, but an accept path was not available afterward in the same session, limiting direct within-session comparison."
    });
  }

  return findings;
}

function getFindingTopicKey(finding: PreviewSampleFinding) {
  const haystack = `${finding.title} ${finding.description}`.toLowerCase();

  if (haystack.includes("before consent") || haystack.includes("pre-consent")) {
    return "preconsent_tracking";
  }

  if (haystack.includes("contradiction") || haystack.includes("conflicts with runtime behavior")) {
    return "policy_behavior_contradiction";
  }

  if (haystack.includes("reject interaction")) {
    return "reject_interaction";
  }

  if (haystack.includes("session replay")) {
    return "session_replay";
  }

  if (haystack.includes("advertising stack") || haystack.includes("tracker")) {
    return "tracker_stack";
  }

  if (haystack.includes("accessibility")) {
    return "accessibility";
  }

  return finding.title.toLowerCase();
}

function dedupeHeadlineFindings(findings: PreviewSampleFinding[]) {
  const seen = new Set<string>();
  const deduped: PreviewSampleFinding[] = [];

  for (const finding of findings) {
    const key = `${finding.category}:${getFindingTopicKey(finding)}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(finding);
  }

  return deduped;
}

function derivePolicyBehaviorContradictions(input: {
  policyEnrichments: Array<Record<string, unknown>>;
  preconsentViolations: Array<{
    evidenceUrls: string[];
    vendorCategory: string;
    vendorName: string;
  }>;
  runtimeArtifacts: Record<string, unknown> | null;
  snapshot: Record<string, unknown> | null;
  trackerVendors: Array<{
    beforeConsent: boolean | null;
    vendorCategory: string;
    vendorName: string;
  }>;
}) {
  const privacyEnrichment =
    input.policyEnrichments.find((row) => (row.pageType ?? row.page_type) === "privacy_policy") ??
    input.policyEnrichments[0] ??
    null;
  const contradictions: PolicyBehaviorContradiction[] = [];
  const trackerVendors = input.trackerVendors.map((tracker) => tracker.vendorName);
  const advertisingVendors = input.trackerVendors
    .filter((tracker) => tracker.vendorCategory === "advertising")
    .map((tracker) => tracker.vendorName);
  const sessionReplayVendors = input.trackerVendors
    .filter((tracker) => tracker.vendorCategory === "session_replay")
    .map((tracker) => tracker.vendorName);
  const preconsentVendors = input.preconsentViolations.map((row) => row.vendorName);
  const preconsentEvidence = [...new Set(input.preconsentViolations.flatMap((row) => row.evidenceUrls))];
  const hasPolicyBehaviorConflict =
    input.snapshot?.policy_behavior_conflict_detected === true || input.snapshot?.policyBehaviorConflictDetected === true;
  const policyFlags = Array.isArray(getPolicyField(privacyEnrichment, "policyActionableFlags", "policy_actionable_flags"))
    ? ((getPolicyField(privacyEnrichment, "policyActionableFlags", "policy_actionable_flags") as unknown[]) ?? []).filter(
        (value): value is string => typeof value === "string"
      )
    : [];
  const policyDoNotSell = String(getPolicyField(privacyEnrichment, "policyDoNotSell", "policy_do_not_sell") ?? "unknown");

  if (preconsentVendors.length > 0) {
    contradictions.push({
      title: "Consent-gated tracking claim conflicts with runtime behavior",
      status: "violation risk",
      severity: "high",
      claim: "The policy and consent surface imply tracking should begin only after a valid consent interaction.",
      observedBehavior: `Trackers fired on first render before consent interaction: ${preconsentVendors.join(", ")}.`,
      evidence: preconsentEvidence.slice(0, 3)
    });
  }

  if ((policyDoNotSell === "present_link" || policyDoNotSell === "present_text") && advertisingVendors.length > 0) {
    contradictions.push({
      title: "Do-not-sell / sharing disclosure conflicts with observed adtech stack",
      status: "likely contradiction",
      severity: "medium",
      claim: "The policy makes an explicit do-not-sell or sharing disclosure, which raises the bar for consistency around third-party marketing data use.",
      observedBehavior: `Advertising or retargeting vendors were observed at runtime: ${advertisingVendors.join(", ")}.`,
      evidence: advertisingVendors.slice(0, 4)
    });
  }

  if (hasPolicyBehaviorConflict || policyFlags.includes("policy_behavior_conflict_candidate")) {
    contradictions.push({
      title: "Policy/behavior conflict detected",
      status: "contradiction",
      severity: "high",
      claim: "Observed runtime behavior appears to conflict with policy representations about tracking or third-party data use.",
      observedBehavior:
        advertisingVendors.length > 0
          ? `Observed adtech vendors include ${advertisingVendors.join(", ")}${sessionReplayVendors.length > 0 ? `; session replay tooling includes ${sessionReplayVendors.join(", ")}.` : "."}`
          : trackerVendors.length > 0
            ? `Observed tracker vendors include ${trackerVendors.slice(0, 6).join(", ")}.`
            : "The scan flagged a policy/behavior conflict based on runtime evidence and policy semantics.",
      evidence: [
        ...(preconsentEvidence.slice(0, 2) ?? []),
        ...advertisingVendors.slice(0, 2),
        ...sessionReplayVendors.slice(0, 1)
      ].slice(0, 4)
    });
  }

  return contradictions.filter(
    (row, index, rows) =>
      rows.findIndex((candidate) => candidate.title === row.title && candidate.observedBehavior === row.observedBehavior) === index
  );
}

function derivePreconsentViolationRows(input: {
  persistedViolations: Array<{
    collectionEndpointType: string;
    confidence: number;
    detectionSource: string;
    evidenceUrls: string[];
    firstPartyOrThirdParty: string;
    matchedSignatureId: string | null;
    scriptHost: string | null;
    vendorCategory: string;
    vendorName: string;
  }>;
  runtimeArtifacts: Record<string, unknown> | null;
  trackerVendors: Array<{
    beforeConsent: boolean | null;
    collectionEndpointType: string;
    confidence: number;
    detectionSource: string;
    matchedSignatureId: string | null;
    scriptHost: string | null;
    vendorCategory: string;
    vendorName: string;
  }>;
}) {
  if (input.persistedViolations.length > 0) {
    return input.persistedViolations;
  }

  const baselineTrackerVendors = getRecordStringArray(input.runtimeArtifacts, "consent_baseline_tracker_vendor_names");
  const baselineEvidenceUrls = getRecordStringArray(input.runtimeArtifacts, "consent_baseline_tracker_evidence_urls");

  return baselineTrackerVendors.map((vendorName) => {
    const tracker = input.trackerVendors.find((candidate) => candidate.vendorName === vendorName);
    const vendorEvidenceUrls = baselineEvidenceUrls.filter((url) => {
      const lowerUrl = url.toLowerCase();
      const lowerVendor = vendorName.toLowerCase();

      if (lowerVendor.includes("linkedin")) {
        return lowerUrl.includes("linkedin") || lowerUrl.includes("licdn");
      }
      if (lowerVendor.includes("google")) {
        return lowerUrl.includes("google") || lowerUrl.includes("doubleclick") || lowerUrl.includes("googletagmanager");
      }
      if (lowerVendor.includes("marketo")) {
        return lowerUrl.includes("marketo") || lowerUrl.includes("munchkin");
      }
      if (lowerVendor.includes("reddit")) {
        return lowerUrl.includes("reddit");
      }
      if (lowerVendor.includes("clarity")) {
        return lowerUrl.includes("clarity");
      }

      return lowerUrl.includes(lowerVendor.replace(/\s+/g, ""));
    });

    return {
      collectionEndpointType: tracker?.collectionEndpointType ?? "unknown",
      confidence: tracker?.confidence ?? 0,
      detectionSource: tracker?.detectionSource ?? "runtime_audit",
      evidenceUrls: vendorEvidenceUrls,
      firstPartyOrThirdParty: "unknown",
      matchedSignatureId: tracker?.matchedSignatureId ?? null,
      scriptHost: tracker?.scriptHost ?? null,
      vendorCategory: tracker?.vendorCategory ?? "unknown",
      vendorName
    };
  });
}

function deriveAccessibilityIssueRows(snapshot: Record<string, unknown>) {
  const rows = [
    {
      key: "contrast",
      count: getSnapshotNumber(snapshot, "wcag_contrast_failures_count"),
      description: "Contrast failures can make text and controls hard to perceive for low-vision users.",
      label: "Contrast failures"
    },
    {
      key: "alt",
      count: getSnapshotNumber(snapshot, "wcag_missing_alt_count"),
      description: "Missing alt text reduces screen-reader access to informative images.",
      label: "Missing alt text"
    },
    {
      key: "navigation",
      count: getSnapshotNumber(snapshot, "wcag_keyboard_navigation_issue_count") + getSnapshotNumber(snapshot, "wcag_focus_indicator_issue_count"),
      description: "Keyboard/focus issues make navigation harder without a mouse.",
      label: "Navigation issues"
    },
    {
      key: "aria",
      count: getSnapshotNumber(snapshot, "wcag_aria_error_count"),
      description: "ARIA issues can break semantics or assistive-technology interpretation.",
      label: "ARIA problems"
    },
    {
      key: "labels",
      count: getSnapshotNumber(snapshot, "wcag_form_label_error_count"),
      description: "Form label issues make inputs less understandable and harder to complete.",
      label: "Form label issues"
    }
  ].filter((row) => row.count > 0);

  return rows.sort((left, right) => right.count - left.count);
}

function getAccessibilitySeverity(count: number) {
  if (count >= 20) {
    return "high";
  }
  if (count >= 5) {
    return "medium";
  }
  return "low";
}

function formatWcagCriteria(criteria: string[]) {
  return criteria.join(", ");
}

type AccessibilityRuleEvidenceRow = {
  criteria: string[];
  description: string | null;
  family: string;
  help: string | null;
  helpUrl: string | null;
  impact: string;
  instanceCount: number;
  pageUrl: string | null;
  remediation: string;
  representativeSelectors: string[];
  ruleCode: string;
  ruleGroup: string;
  severity: string;
  weightedPriority: number;
};

function getAccessibilityRuleMetadata(ruleCode: string, ruleGroup: string) {
  const metadataByRuleCode: Record<
    string,
    {
      criteria: string[];
      family: string;
      impact: string;
      remediation: string;
    }
  > = {
    "color-contrast": {
      criteria: ["WCAG 1.4.3", "WCAG 1.4.11"],
      family: "Contrast",
      impact: "Low-vision users may struggle to read text or distinguish controls.",
      remediation: "Adjust foreground, background, and focus-state contrast on primary UI elements."
    },
    "image-alt": {
      criteria: ["WCAG 1.1.1"],
      family: "Alt text",
      impact: "Screen-reader users may miss meaningful image content.",
      remediation: "Add descriptive alt text for informative images and empty alt text for decorative images."
    },
    "label": {
      criteria: ["WCAG 1.3.1", "WCAG 3.3.2"],
      family: "Form labels",
      impact: "Inputs become harder to understand and complete with assistive technology.",
      remediation: "Associate visible labels or robust accessible names with every user-input control."
    },
    "aria-valid-attr-value": {
      criteria: ["WCAG 4.1.2"],
      family: "ARIA",
      impact: "Broken ARIA values can confuse assistive technologies or invalidate semantics.",
      remediation: "Correct invalid ARIA attributes and values to restore reliable semantics."
    },
    "aria-required-attr": {
      criteria: ["WCAG 4.1.2"],
      family: "ARIA",
      impact: "Missing required ARIA attributes can break expected component behavior for assistive technology.",
      remediation: "Add the required ARIA attributes for each custom widget pattern."
    },
    "button-name": {
      criteria: ["WCAG 4.1.2", "WCAG 2.4.4"],
      family: "Navigation",
      impact: "Unnamed controls create ambiguity for screen-reader and keyboard users.",
      remediation: "Ensure every actionable control has a clear accessible name."
    },
    "link-name": {
      criteria: ["WCAG 2.4.4", "WCAG 4.1.2"],
      family: "Navigation",
      impact: "Links without names make navigation and page comprehension harder.",
      remediation: "Provide descriptive visible or accessible names for each link target."
    },
    "heading-order": {
      criteria: ["WCAG 1.3.1", "WCAG 2.4.6"],
      family: "Structure",
      impact: "Broken heading hierarchy makes content harder to scan and navigate.",
      remediation: "Restore logical heading order and hierarchy across primary content sections."
    },
    "landmark-one-main": {
      criteria: ["WCAG 1.3.1"],
      family: "Navigation",
      impact: "Missing landmarks can make page regions less navigable for assistive technology.",
      remediation: "Add consistent landmark structure, especially a single main region."
    }
  };

  const directMatch = metadataByRuleCode[ruleCode];
  if (directMatch) {
    return directMatch;
  }

  const metadataByRuleGroup: Record<
    string,
    {
      criteria: string[];
      family: string;
      impact: string;
      remediation: string;
    }
  > = {
    alt: {
      criteria: ["WCAG 1.1.1"],
      family: "Alt text",
      impact: "Non-text content is less accessible to screen-reader users.",
      remediation: "Add or repair alternative text coverage on meaningful image content."
    },
    contrast: {
      criteria: ["WCAG 1.4.3", "WCAG 1.4.11"],
      family: "Contrast",
      impact: "Insufficient contrast reduces readability and control discoverability.",
      remediation: "Raise text, icon, and control contrast across affected UI states."
    },
    aria: {
      criteria: ["WCAG 4.1.2"],
      family: "ARIA",
      impact: "ARIA implementation issues can break semantics and announcements.",
      remediation: "Repair custom component semantics and invalid ARIA usage."
    },
    label: {
      criteria: ["WCAG 1.3.1", "WCAG 3.3.2"],
      family: "Form labels",
      impact: "Users may not understand what a form control expects.",
      remediation: "Add explicit labels and stable accessible names for each form input."
    },
    keyboard: {
      criteria: ["WCAG 2.1.1", "WCAG 2.4.7"],
      family: "Keyboard",
      impact: "Keyboard users can lose navigation flow or focus visibility.",
      remediation: "Fix keyboard navigation traps, missing focus styles, and tab order issues."
    },
    focus: {
      criteria: ["WCAG 2.4.7"],
      family: "Keyboard",
      impact: "Users may lose sight of where focus is on the page.",
      remediation: "Restore strong visible focus indicators on interactive elements."
    },
    landmark: {
      criteria: ["WCAG 1.3.1"],
      family: "Navigation",
      impact: "Missing landmarks reduce efficient page navigation for assistive technology.",
      remediation: "Add and validate landmark roles for major page regions."
    },
    heading: {
      criteria: ["WCAG 1.3.1", "WCAG 2.4.6"],
      family: "Structure",
      impact: "Heading structure problems make pages harder to navigate and understand.",
      remediation: "Repair heading levels and page outline consistency."
    },
    link: {
      criteria: ["WCAG 2.4.4"],
      family: "Navigation",
      impact: "Weak or missing link names make navigation ambiguous.",
      remediation: "Use descriptive link text and accessible names."
    }
  };

  return (
    metadataByRuleGroup[ruleGroup] ?? {
      criteria: ["WCAG review needed"],
      family: "Other",
      impact: "Automated accessibility issues were detected in this rule family.",
      remediation: "Review the affected components and validate the issue against the relevant WCAG success criteria."
    }
  );
}

function deriveAccessibilityRuleEvidenceRows(input: {
  examples: Array<{
    description: string;
    help: string;
    helpUrl: string;
    impact: string | null;
    nodeCount: number;
    pageUrl: string;
    representativeSelectors: string[];
    ruleCode: string;
    ruleGroup: string;
    severity: string;
  }>;
  ruleCounts: Array<{
    instanceCount: number;
    ruleCode: string;
    ruleGroup: string;
    severity: string;
  }>;
}): AccessibilityRuleEvidenceRow[] {
  if (input.examples.length > 0) {
    return input.examples.map((example) => {
      const metadata = getAccessibilityRuleMetadata(example.ruleCode, example.ruleGroup);
      const weightedPriority =
        (example.severity === "high" ? 30 : example.severity === "medium" ? 20 : 10) + Math.min(example.nodeCount, 25);

      return {
        ...example,
        ...metadata,
        instanceCount: example.nodeCount,
        weightedPriority
      };
    });
  }

  return input.ruleCounts.map((rule) => {
    const metadata = getAccessibilityRuleMetadata(rule.ruleCode, rule.ruleGroup);
    const weightedPriority =
      (rule.severity === "high" ? 30 : rule.severity === "medium" ? 20 : 10) + Math.min(rule.instanceCount, 25);

    return {
      ...rule,
      ...metadata,
      description: null,
      help: null,
      helpUrl: null,
      pageUrl: null,
      representativeSelectors: [],
      weightedPriority
    };
  });
}

function getRepresentativeAccessibilityExamplesForSignal(input: {
  rows: AccessibilityRuleEvidenceRow[];
  signalKey: string;
}) {
  const matches = input.rows.filter((row) => {
    if (/wcag_contrast_failures_count/i.test(input.signalKey)) {
      return row.ruleCode === "color-contrast" || row.ruleGroup === "contrast";
    }

    if (/wcag_form_label_error_count/i.test(input.signalKey)) {
      return row.ruleCode === "label" || row.ruleGroup === "label";
    }

    if (/wcag_link_name_error_count/i.test(input.signalKey)) {
      return row.ruleCode === "link-name" || row.ruleGroup === "link";
    }

    return false;
  });

  return matches.slice(0, 3).map((row) => ({
    description: row.description,
    help: row.help,
    helpUrl: row.helpUrl,
    pageUrl: row.pageUrl,
    representativeSelectors: row.representativeSelectors.slice(0, 3),
    ruleCode: row.ruleCode,
    ruleGroup: row.ruleGroup
  }));
}

function hasTruthySignal(
  signals: Array<{ key: string; value: boolean | number | string | string[] }>,
  key: string
) {
  return signals.some((signal) => {
    const matches = signal.key === key || signal.key.endsWith(`.${key}`);
    return matches && signal.value === true;
  });
}

const OPERATIONAL_SNAPSHOT_SECTIONS = [
  {
    title: "Coverage",
    fields: [
      "total_signals",
      "accessibility_signal_count",
      "privacy_signal_count",
      "disclosure_signal_count",
      "certscore_overall",
      "privacy_score",
      "consent_score",
      "tracker_risk_score",
      "accessibility_score",
      "data_collection_risk_score",
      "consumer_protection_score",
      "children_privacy_risk_score",
      "legal_coverage_score",
      "regulatory_exposure_score",
      "compliance_maturity_tier"
    ]
  },
  {
    title: "Crawl And Site",
    fields: [
      "scan_timestamp",
      "scanner_schema_version",
      "detection_engine_version",
      "domain",
      "registered_domain",
      "crawl_source",
      "crawl_tier",
      "robots_allowed",
      "robots_fetch_status",
      "robots_fetch_http_status",
      "homepage_fetch_status",
      "homepage_fetch_http_status",
      "final_url",
      "redirect_count",
      "render_mode_used",
      "scan_confidence",
      "partial_scan",
      "timeout_flag",
      "blocked_flag",
      "captcha_flag",
      "country_inferred",
      "jurisdiction_guess",
      "traffic_tier_estimate"
    ]
  },
] as const;

const SNAPSHOT_SECTION_HELP: Record<string, string> = {
  Coverage: "A compact view of how many signals the scan surfaced and how the main scoring layers resolved.",
  "Crawl And Site": "Core crawl outcome, fetch behavior, and site-level context captured during the scan."
};

type ResultMetric = {
  label: string;
  value: string;
  tooltip: string;
};

type ResultDetail = {
  label: string;
  value: unknown;
};

type CanonicalReviewIssue = {
  description: string;
  evidence?: string[];
  linkedValidationRuleKeys?: string[];
  severity: "high" | "medium" | "low";
  title: string;
};

type CanonicalReviewFinding = {
  categoryId?: string;
  description: string;
  evidence?: string[];
  fallbackEvidence?: Record<string, unknown>;
  id: string;
  linkedValidationFinding?: ScanValidationFinding | null;
  observedValue: string | null;
  severity: "high" | "medium" | "low";
  signalKey?: string;
  signalLabel?: string;
  signalSource?: ReportSignalDefinition["source"];
  sourceType: "issue" | "signal";
  title: string;
};

type ScanRecordData = NonNullable<Awaited<ReturnType<typeof getScanById>>>;

type CanonicalTaxonomyReviewProps = {
  accessibilityIssueRows: ReturnType<typeof deriveAccessibilityIssueRows>;
  consentAuditFindings: PreviewSampleFinding[];
  policyBehaviorContradictions: PolicyBehaviorContradiction[];
  preconsentViolationRows: ReturnType<typeof derivePreconsentViolationRows>;
  prioritizedAccessibilityRuleRows: ReturnType<typeof deriveAccessibilityRuleEvidenceRows>;
  scanRecord: ScanRecordData;
  scanReportReviewIssues: Array<{
    description: string;
    key: string;
    pageType: string;
    pageUrl: string | null;
    reason: string;
    reviewStatus: string;
    reviewVerdict: unknown;
    summary: unknown;
  }>;
  snapshot: Record<string, unknown>;
};

function ScanSectionFallback(input: { message: string; title: string }) {
  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-950">
      <p className="font-semibold">{input.title}</p>
      <p className="mt-1 text-amber-900">{input.message}</p>
    </div>
  );
}

function renderCanonicalTaxonomyReviewSafely(input: CanonicalTaxonomyReviewProps) {
  try {
    return <CanonicalTaxonomyReview {...input} />;
  } catch (error) {
    console.error("Failed to render canonical scan review", error);
    return (
      <ScanSectionFallback
        title="Review sections unavailable"
        message="The live scan completed, but the structured review sections could not be rendered for this scan. Advanced diagnostics are still available below."
      />
    );
  }
}

type CanonicalSignalItem = {
  key: string;
  label: string;
  relation: "primary" | "secondary" | "overlay";
  source: ReportSignalDefinition["source"];
  value: unknown;
};

function toSnakeCase(value: string) {
  return value.replace(/[A-Z]/g, (character) => `_${character.toLowerCase()}`);
}

function getSignalNamespaceKey(key: string) {
  const separatorIndex = key.indexOf(".");
  return separatorIndex >= 0 ? key.slice(separatorIndex + 1) : key;
}

function findPersistedSignalValue(
  signals: Array<{ key: string; value: boolean | number | string | string[] }>,
  key: string
) {
  return signals.find((signal) => signal.key === key)?.value ?? null;
}

function getPolicyEnrichmentValue(policyEnrichment: Array<Record<string, unknown>>, key: string) {
  for (const row of policyEnrichment) {
    const value = getPolicyField(row, key, toSnakeCase(key));
    if (value !== null) {
      return value;
    }
  }

  return null;
}

function getSnapshotSignalValue(snapshot: Record<string, unknown> | null, signalKey: string) {
  if (!snapshot) {
    return null;
  }

  const snapshotKey = getSignalNamespaceKey(signalKey);
  const directValue = snapshot[snapshotKey];
  if (directValue !== null && directValue !== undefined) {
    return directValue;
  }

  switch (signalKey) {
    case "privacy.cmp_vendor_detected":
      return snapshot.cmp_vendor_name ?? null;
    default:
      return null;
  }
}

function getReportSignalValue(input: {
  policyEnrichment: Array<Record<string, unknown>>;
  runtimeArtifacts: Record<string, unknown> | null;
  signals: Array<{ key: string; value: boolean | number | string | string[] }>;
  snapshot: Record<string, unknown> | null;
  signal: ReportSignalDefinition;
}) {
  if (input.signal.source === "snapshot_signal") {
    return getSnapshotSignalValue(input.snapshot, input.signal.key) ?? findPersistedSignalValue(input.signals, input.signal.key);
  }

  if (input.signal.source === "runtime_artifact_signal") {
    return input.runtimeArtifacts?.[input.signal.key] ?? findPersistedSignalValue(input.signals, input.signal.key);
  }

  return getPolicyEnrichmentValue(input.policyEnrichment, input.signal.key) ?? findPersistedSignalValue(input.signals, input.signal.key);
}

function isSignalValuePopulated(key: string, value: unknown) {
  if (value === null || value === undefined || value === "") {
    return false;
  }

  if (Array.isArray(value)) {
    return value.length > 0;
  }

  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      return false;
    }

    if (/score|window_days|word_count|semantic_confidence/i.test(key)) {
      return true;
    }

    return value > 0;
  }

  if (typeof value === "string") {
    return value.trim().length > 0 && value !== "unknown" && value !== "absent" && value !== "none";
  }

  return true;
}

function isConcerningSignal(key: string, value: unknown) {
  if (!isSignalValuePopulated(key, value)) {
    return false;
  }

  if (typeof value === "number" && !Number.isFinite(value)) {
    return false;
  }

  const negativePatterns = [
    /dark_pattern/,
    /preconsent/,
    /conflict/,
    /mismatch/,
    /litigation_risk_score/,
    /error_count/,
    /warning_count/,
    /issue_count/,
    /failures_count/,
    /store_credit_only/,
    /termination_for_cause/,
    /service_suspension_or_termination/,
    /retargeting_pixel/,
    /session_replay/,
    /functional_misalignment/,
    /technical_disclosure/,
    /disclosure_gap/,
    /surface_missing/,
    /fetch_failed/,
    /bounded_search/,
    /structurally_obstructed/,
    /likely_obstructed/,
    /high_sensitivity_data_collection_detected/,
    /limited_time_offer_language_present/,
    /discount_claim_present/,
    /original_price_comparison_present/
  ];

  if (negativePatterns.some((pattern) => pattern.test(key))) {
    return true;
  }

  if (typeof value === "number") {
    if (/risk_score|ambiguity_score|friction_score/i.test(key)) {
      return value > 0;
    }
    if (/window_days/i.test(key)) {
      return false;
    }
  }

  return false;
}

function getSignalConcernReason(key: string, value: unknown) {
  if (!isConcerningSignal(key, value)) {
    return null;
  }

  if (/preconsent|tracking_before_consent/i.test(key)) {
    return "Observed before a clear user choice was made.";
  }

  if (/surface_missing/i.test(key)) {
    return "A key disclosure or support page surface was not detected during the scan.";
  }

  if (/fetch_failed/i.test(key)) {
    return "A key disclosure or support page was detected, but its target URL could not be fetched successfully.";
  }

  if (/key_page_discovery_unresolved_after_bounded_search/i.test(key)) {
    return "The scanner exhausted its bounded key-page discovery budget without confirming one or more expected legal or support pages.";
  }

  if (/conflict|mismatch/i.test(key)) {
    return "Signals a contradiction or mismatch that merits direct review.";
  }

  if (/dark_pattern|limited_time_offer_language_present|discount_claim_present|original_price_comparison_present/i.test(key)) {
    return "Promotional or choice architecture may need closer disclosure review.";
  }

  if (/store_credit_only/i.test(key)) {
    return "Post-purchase remedy may be more restrictive than expected.";
  }

  if (/termination_for_cause|service_suspension_or_termination/i.test(key)) {
    return "Terms reserve restrictive enforcement rights that should be read directly.";
  }

  if (/risk_score|ambiguity_score|friction_score/i.test(key)) {
    return "Scanner-derived risk indicator is elevated.";
  }

  if (/error_count|warning_count|issue_count|failures_count/i.test(key)) {
    return "Automated issues were surfaced in this area.";
  }

  return "This signal is worth reviewer attention.";
}

function buildSectionReviewIssues(input: {
  accessibilityIssueRows: ReturnType<typeof deriveAccessibilityIssueRows>;
  consentAuditFindings: PreviewSampleFinding[];
  policyBehaviorContradictions: PolicyBehaviorContradiction[];
  preconsentViolationRows: ReturnType<typeof derivePreconsentViolationRows>;
  scanReportReviewIssues: CanonicalTaxonomyReviewProps["scanReportReviewIssues"];
  sectionId: string;
  snapshot: Record<string, unknown>;
}) {
  const issues: CanonicalReviewIssue[] = [];

  if (input.sectionId === "policy_clarity_consistency_review") {
    issues.push(
      ...input.policyBehaviorContradictions.map((row) => ({
        description: row.observedBehavior,
        evidence: row.evidence,
        severity: row.severity,
        title: row.title
      }))
    );

    issues.push(
      ...dedupeReviewIssues(
        input.scanReportReviewIssues.map((row) => {
          const reviewSeverity: CanonicalReviewIssue["severity"] =
            row.reason === "policy_behavior_conflict_candidate" ? "high" : "medium";

          return {
            description: row.description,
            evidence: row.pageUrl ? [row.pageUrl] : [],
            linkedValidationRuleKeys: getValidationMatchKeysForReviewReason(row.reason),
            severity: reviewSeverity,
            title: formatReviewIssueReason(row.reason)
          };
        })
      )
    );
  }

  if (input.sectionId === "tracking_third_party_ecosystem" && input.preconsentViolationRows.length > 0) {
    issues.push({
      description: `Observed vendor activity before consent for ${input.preconsentViolationRows.length} vendor${input.preconsentViolationRows.length === 1 ? "" : "s"}.`,
      evidence: input.preconsentViolationRows.flatMap((row) => row.evidenceUrls).slice(0, 3),
      severity: "high",
      title: "Pre-consent tracking incidents detected"
    });
  }

  if (input.sectionId === "consent_controls_enforcement") {
    issues.push(
      ...input.consentAuditFindings.map((finding) => ({
        description: finding.description,
        severity: finding.severity === "info" ? "low" : finding.severity,
        title: finding.title
      }))
    );
  }

  if (input.sectionId === "access_barriers_task_completion") {
    issues.push(
      ...input.accessibilityIssueRows
        .filter((row) => row.count > 0)
        .slice(0, 3)
        .map((row) => {
          const severity: CanonicalReviewIssue["severity"] = row.count >= 5 ? "high" : row.count >= 2 ? "medium" : "low";

          return {
            description: `${row.count} observed in the automated accessibility audit.`,
            severity,
            title: row.label
          };
        })
    );
  }

  if (input.sectionId === "accessibility_commitments_conformance_support" && input.snapshot.accessibility_claim_mismatch_detected === true) {
    issues.push({
      description: "Public-facing accessibility claims appear to conflict with the automated issue profile captured during the scan.",
      severity: "high",
      title: "Accessibility claim mismatch detected"
    });
  }

  if (input.sectionId === "billing_cancellation_post_purchase_rights" && input.snapshot.store_credit_only_policy_present === true) {
    issues.push({
      description: "The refund/remedy posture appears to lean on store credit only, which is worth direct reviewer attention.",
      severity: "medium",
      title: "Store-credit-only remedy detected"
    });
  }

  return issues;
}

function dedupeReviewIssues(issues: CanonicalReviewIssue[]) {
  const seen = new Set<string>();

  return issues.filter((issue) => {
    const key = [
      issue.title.trim().toLowerCase(),
      issue.description.trim().toLowerCase(),
      issue.severity,
      ...(issue.evidence ?? []).map((entry) => entry.trim().toLowerCase()).sort()
    ].join("::");

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function severityRank(severity: CanonicalReviewFinding["severity"]) {
  switch (severity) {
    case "high":
      return 0;
    case "medium":
      return 1;
    default:
      return 2;
  }
}

function getKeyPageTypeForSignal(key: string) {
  if (/disclosure\.privacy_policy_fetch_failed/i.test(key)) {
    return "privacy_policy";
  }
  if (/disclosure\.terms_of_service_fetch_failed/i.test(key)) {
    return "terms_of_service";
  }
  if (/disclosure\.cookie_policy_fetch_failed/i.test(key)) {
    return "cookie_policy";
  }
  if (/disclosure\.accessibility_statement_fetch_failed/i.test(key)) {
    return "accessibility_statement";
  }
  if (/disclosure\.contact_page_fetch_failed/i.test(key)) {
    return "contact";
  }
  return null;
}

function getKeyPageDiscoveryPageSummary(
  summary: unknown,
  pageType: string
): {
  attemptCount: number | null;
  attemptedUrls: string[];
  bestDiscoverySource: string | null;
  guessedOnly: boolean;
  stopReason: string | null;
} | null {
  if (!summary || typeof summary !== "object") {
    return null;
  }

  const pageSummaries = (summary as { pageSummaries?: unknown }).pageSummaries;
  if (!Array.isArray(pageSummaries)) {
    return null;
  }

  const match = pageSummaries.find(
    (entry): entry is Record<string, unknown> =>
      Boolean(entry) && typeof entry === "object" && entry.pageType === pageType
  );

  if (!match) {
    return null;
  }

  return {
    attemptCount: typeof match.attemptCount === "number" ? match.attemptCount : null,
    attemptedUrls: Array.isArray(match.attemptedUrls)
      ? match.attemptedUrls.filter((value): value is string => typeof value === "string")
      : [],
    bestDiscoverySource: typeof match.bestDiscoverySource === "string" ? match.bestDiscoverySource : null,
    guessedOnly: match.guessedOnly === true
    ,
    stopReason: typeof match.stopReason === "string" ? match.stopReason : null
  };
}

function buildReviewFindings(input: {
  categoryId?: string;
  issues: CanonicalReviewIssue[];
  prioritizedAccessibilityRuleRows: AccessibilityRuleEvidenceRow[];
  runtimeArtifacts?: Record<string, unknown> | null;
  sectionId: string;
  sectionItems: CanonicalSignalItem[];
  validationFindingLookup?: Map<string, ScanValidationFinding>;
}) {
  const signalFindings: CanonicalReviewFinding[] = input.sectionItems
    .filter((item) => item.relation === "primary" && isConcerningSignal(item.key, item.value))
    .flatMap((item): CanonicalReviewFinding[] => {
      const linkedValidationFinding = input.validationFindingLookup
        ? findValidationFindingForKeys(input.validationFindingLookup, getValidationMatchKeysForSignal(item.key))
        : null;
      const keyPageType = getKeyPageTypeForSignal(item.key);
      const keyPageSummary =
        keyPageType
          ? getKeyPageDiscoveryPageSummary(input.runtimeArtifacts?.key_page_discovery_summary, keyPageType)
          : null;
      const accessibilityRuleExamples = getRepresentativeAccessibilityExamplesForSignal({
        rows: input.prioritizedAccessibilityRuleRows,
        signalKey: item.key
      });

      const fallbackEvidence =
        isRightsFrictionSignal(item.key)
          ? {
              consentBlockerPageTitle:
                typeof input.runtimeArtifacts?.consent_blocker_page_title === "string"
                  ? input.runtimeArtifacts.consent_blocker_page_title
                  : null,
              consentBlockerTextSnippet:
                typeof input.runtimeArtifacts?.consent_blocker_text_snippet === "string"
                  ? input.runtimeArtifacts.consent_blocker_text_snippet
                  : null,
              consentBlockerType:
                typeof input.runtimeArtifacts?.consent_blocker_type === "string"
                  ? input.runtimeArtifacts.consent_blocker_type
                  : null,
              consentBlockerUrl:
                typeof input.runtimeArtifacts?.consent_blocker_url === "string"
                  ? input.runtimeArtifacts.consent_blocker_url
                  : null,
              consentEvidencePassCount:
                typeof input.runtimeArtifacts?.consent_evidence_pass_count === "number"
                  ? input.runtimeArtifacts.consent_evidence_pass_count
                  : null,
              consentFrictionDelta:
                typeof input.runtimeArtifacts?.consent_friction_delta === "number"
                  ? input.runtimeArtifacts.consent_friction_delta
                  : null,
              consentOptInClicks:
                typeof input.runtimeArtifacts?.consent_opt_in_clicks === "number"
                  ? input.runtimeArtifacts.consent_opt_in_clicks
                  : null,
              consentOptOutClicks:
                typeof input.runtimeArtifacts?.consent_opt_out_clicks === "number"
                  ? input.runtimeArtifacts.consent_opt_out_clicks
                  : null,
              consentRedirectOrAuthRequired: input.runtimeArtifacts?.consent_redirect_or_auth_required === true,
              signalKey: item.key,
              signalLabel: item.label,
              signalValue: item.value
            }
          : /commerce\.high_sensitivity_data_collection_detected/i.test(item.key)
            ? {
                sensitivePayloadViolations: Array.isArray(input.runtimeArtifacts?.sensitive_payload_violations)
                  ? input.runtimeArtifacts.sensitive_payload_violations.slice(0, 3)
                  : [],
                signalKey: item.key,
                signalLabel: item.label,
                signalValue: item.value
              }
            : keyPageType
              ? {
                  keyPageAttemptCount: keyPageSummary?.attemptCount ?? null,
                  keyPageDiscoverySource: keyPageSummary?.bestDiscoverySource ?? null,
                  keyPageGuessedOnly: keyPageSummary?.guessedOnly ?? null,
                  keyPageAttemptedUrls: keyPageSummary?.attemptedUrls ?? [],
                  keyPageStopReason: keyPageSummary?.stopReason ?? null,
                  signalKey: item.key,
                  signalLabel: item.label,
                  signalValue: item.value
                }
              : {
                  accessibilityRuleExamples,
                  signalKey: item.key,
                  signalLabel: item.label,
                  signalValue: item.value
                };

      if (!shouldSurfacePrimarySignalFinding({
        fallbackEvidence,
        key: item.key,
        linkedValidationEvidence: linkedValidationFinding?.evidence ?? null
      })) {
        return [];
      }

      return [{
        categoryId: input.categoryId,
        description: getSignalConcernReason(item.key, item.value) ?? "This signal is worth reviewer attention.",
        fallbackEvidence,
        id: `${input.sectionId}-signal-${item.key}`,
        linkedValidationFinding,
        observedValue: formatCompactValue(item.value),
        severity: getSignalFindingSeverity(item.key, item.value),
        signalKey: item.key,
        signalLabel: item.label,
        signalSource: item.source,
        sourceType: "signal",
        title: item.label
      }];
    });

  const issueFindings: CanonicalReviewFinding[] = input.issues.map((issue, index) => ({
    categoryId: input.categoryId ?? getDefaultIssueCategoryId(input.sectionId),
    description: issue.description,
    evidence: issue.evidence,
    id: `${input.sectionId}-issue-${index}`,
    linkedValidationFinding: input.validationFindingLookup
      ? findValidationFindingForKeys(
          input.validationFindingLookup,
          issue.linkedValidationRuleKeys && issue.linkedValidationRuleKeys.length > 0
            ? issue.linkedValidationRuleKeys
            : getValidationMatchKeysForTitle(issue.title)
        )
      : null,
    observedValue: summarizeObservedIssueEvidence(issue.evidence, issue.severity),
    severity: issue.severity,
    sourceType: "issue",
    title: issue.title
  }));

  return [...signalFindings, ...issueFindings].sort(
    (left, right) => severityRank(left.severity) - severityRank(right.severity) || left.title.localeCompare(right.title)
  );
}

function getDefaultIssueCategoryId(sectionId: string) {
  switch (sectionId) {
    case "policy_clarity_consistency_review":
      return "cross_document_consistency";
    default:
      return undefined;
  }
}

function getSignalFindingSeverity(key: string, value: unknown): CanonicalReviewFinding["severity"] {
  if (/preconsent|tracking_before_consent|session_replay|conflict|mismatch/i.test(key)) {
    return "high";
  }

  if (/privacy_policy_(surface_missing|fetch_failed)/i.test(key)) {
    return "high";
  }

  if (/key_page_discovery_unresolved_after_bounded_search|surface_missing|fetch_failed|dark_pattern|limited_time_offer_language_present|discount_claim_present|original_price_comparison_present|store_credit_only|termination_for_cause|service_suspension_or_termination/i.test(key)) {
    return "medium";
  }

  if (typeof value === "number" && /risk_score|ambiguity_score|friction_score/i.test(key)) {
    return value >= 70 ? "high" : "medium";
  }

  return "medium";
}

function ReviewFindingLinks(input: { finding: UnifiedFindingDisplayPacket }) {
  const shouldShowReferenceLink =
    input.finding.referenceUrl &&
    input.finding.referenceUrl !== input.finding.presentation.suggestedBestPractice?.url;

  if (!input.finding.sourceUrl && !shouldShowReferenceLink) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {input.finding.sourceUrl ? (
        <Link
          href={input.finding.sourceUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 rounded-full border border-slate-300 bg-white px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.12em] text-slate-700"
        >
          <span>?</span>
          <span>{input.finding.sourceLabel ?? "Source"}</span>
        </Link>
      ) : null}
      {shouldShowReferenceLink ? (
        <Link
          href={input.finding.referenceUrl!}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 rounded-full border border-slate-300 bg-white px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.12em] text-slate-700"
        >
          <span>↗</span>
          <span>{input.finding.referenceLabel ?? "Reference"}</span>
        </Link>
      ) : null}
    </div>
  );
}

function formatValidationSupport(finding: UnifiedFindingDisplayPacket) {
  if (!finding.linkedValidationFinding) {
    return null;
  }

  const parts = [
    finding.linkedValidationFinding.verdict ? `Validation ${finding.linkedValidationFinding.verdict.replaceAll("_", " ")}` : null,
    finding.linkedValidationFinding.agreementScore !== null ? `agreement ${finding.linkedValidationFinding.agreementScore}` : null,
    finding.linkedValidationFinding.systemConfidenceBand
      ? `system confidence ${finding.linkedValidationFinding.systemConfidenceBand.replaceAll("_", " ")}`
      : null
  ].filter((part): part is string => Boolean(part));

  return parts.length > 0 ? parts.join(" · ") : null;
}

function summarizeObservedIssueEvidence(evidence: string[] | undefined, severity: CanonicalReviewFinding["severity"]) {
  if (!evidence || evidence.length === 0) {
    return `${severity} severity`;
  }

  const nonUrlEvidence = evidence.filter((entry) => !/^https?:\/\//i.test(entry.trim()));
  if (nonUrlEvidence.length > 0) {
    return summarizeReviewIssueEvidence(nonUrlEvidence);
  }

  return evidence.length === 1 ? "Linked evidence available" : `${evidence.length} linked evidence items`;
}

function getFindingToneClasses(severity: UnifiedFindingDisplayPacket["severity"]) {
  switch (severity) {
    case "high":
      return "border-rose-200 bg-rose-50";
    case "medium":
      return "border-amber-200 bg-amber-50";
    default:
      return "border-sky-200 bg-sky-50";
  }
}

function getFindingBadgeClasses(severity: UnifiedFindingDisplayPacket["severity"]) {
  switch (severity) {
    case "high":
      return "bg-rose-100 text-rose-900";
    case "medium":
      return "bg-amber-100 text-amber-900";
    default:
      return "bg-sky-100 text-sky-900";
  }
}

function getScanFindingSeverityWeight(severity: UnifiedFindingDisplayPacket["severity"]) {
  switch (severity) {
    case "high":
      return 3;
    case "medium":
      return 2;
    default:
      return 1;
  }
}

function getConfidenceBadgeClasses(band: UnifiedFindingDisplayPacket["confidenceBand"]) {
  switch (band) {
    case "high":
      return "bg-emerald-100 text-emerald-900";
    case "moderate":
      return "bg-amber-100 text-amber-900";
    default:
      return "bg-slate-100 text-slate-700";
  }
}

function ReviewFindingCard(input: { finding: UnifiedFindingDisplayPacket }) {
  const validationSupport = formatValidationSupport(input.finding);

  return (
    <div className={`rounded-lg border px-3 py-3 ${getFindingToneClasses(input.finding.severity)}`}>
      <div className="grid gap-4 md:grid-cols-[1.1fr_1.5fr_1.8fr]">
        <div className="min-w-0 space-y-2">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold text-slate-950">{input.finding.presentation.findingName}</p>
              <span
                className={`rounded-full px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.12em] ${getFindingBadgeClasses(input.finding.severity)}`}
              >
                {input.finding.severity}
              </span>
              <span
                className={`rounded-full px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.12em] ${getConfidenceBadgeClasses(input.finding.confidenceBand)}`}
              >
                {input.finding.confidenceBand} confidence
              </span>
            </div>
            <p className="mt-1 text-sm text-slate-700">{input.finding.observedValue ?? `${input.finding.severity} severity`}</p>
          </div>
          {input.finding.presentation.confidenceScore ? (
            <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Confidence {input.finding.presentation.confidenceScore}</p>
          ) : null}
          {validationSupport ? <p className="text-xs text-slate-500">{validationSupport}</p> : null}
        </div>
        <div className="space-y-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Why It Matters</p>
          <p className="text-sm text-slate-700">{input.finding.presentation.whyThisMatters}</p>
        </div>
        <div className="min-w-0 space-y-2">
          <div className="space-y-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Suggested Fix</p>
            <p className="text-sm text-slate-700">{input.finding.presentation.suggestedFix}</p>
          </div>
          {input.finding.presentation.suggestedBestPractice ? (
            <Link
              href={input.finding.presentation.suggestedBestPractice.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 rounded-full border border-slate-300 bg-white px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.12em] text-slate-700"
            >
              <span>↗</span>
              <span>{input.finding.presentation.suggestedBestPractice.label}</span>
            </Link>
          ) : null}
          <ReviewFindingLinks finding={input.finding} />
        </div>
      </div>
    </div>
  );
}

function summarizeEvidence(packet: UnifiedFindingDisplayPacket) {
  const parts = [
    packet.evidence?.pageUrls?.length ? `${packet.evidence.pageUrls.length} page${packet.evidence.pageUrls.length === 1 ? "" : "s"}` : null,
    packet.confidenceInputs.signalCount > 0 ? `${packet.confidenceInputs.signalCount} signal${packet.confidenceInputs.signalCount === 1 ? "" : "s"}` : null,
    packet.confidenceInputs.validationCount > 0
      ? `${packet.confidenceInputs.validationCount} validation row${packet.confidenceInputs.validationCount === 1 ? "" : "s"}`
      : null,
    packet.confidenceInputs.issueCount > 0 ? `${packet.confidenceInputs.issueCount} synthesized issue${packet.confidenceInputs.issueCount === 1 ? "" : "s"}` : null
  ].filter((value): value is string => Boolean(value));

  return parts.length > 0 ? parts.join(" · ") : "Evidence packet assembled for this finding.";
}

function deriveAgencyAdvisoryThemes(findings: UnifiedFindingDisplayPacket[]) {
  const themes = new Set<string>();

  for (const finding of findings) {
    switch (finding.details?.family) {
      case "consent_tracking":
        themes.add("consent and tracking controls");
        break;
      case "contradiction":
        themes.add("public claims versus observed behavior");
        break;
      case "rights_gap":
      case "policy_extraction":
      case "coverage_gap":
        themes.add("policy and disclosure coverage");
        break;
      case "accessibility":
        themes.add("accessibility and task completion");
        break;
      case "commercial":
        themes.add("commercial transparency");
        break;
      case "sensitive_data":
        themes.add("sensitive-data handling");
        break;
      default:
        break;
    }
  }

  return [...themes];
}

function AgencyAdvisorySummary(input: { findings: UnifiedFindingDisplayPacket[] }) {
  const highPriorityCount = input.findings.filter((finding) => finding.severity === "high").length;
  const mediumPriorityCount = input.findings.filter((finding) => finding.severity === "medium").length;
  const themes = deriveAgencyAdvisoryThemes(input.findings).slice(0, 3);
  const clientBullets = [
    highPriorityCount > 0
      ? `${highPriorityCount} high-priority finding${highPriorityCount === 1 ? "" : "s"} should be reviewed with the site owner first.`
      : "No high-priority findings were promoted in the main report.",
    mediumPriorityCount > 0
      ? `${mediumPriorityCount} medium-priority finding${mediumPriorityCount === 1 ? "" : "s"} should be scoped into the next remediation pass.`
      : "No medium-priority findings were promoted in the main report.",
    themes.length > 0
      ? `The main exposure themes for this site are ${themes.join(", ")}.`
      : "The surfaced findings do not yet point to one dominant exposure theme."
  ];
  const agencyBullets = [
    "Use this report to brief the client on risk and remediation, but keep legal and compliance ownership explicitly with the site owner.",
    "Document which surfaced findings your team will fix, which require client approval, and which need counsel or policy review.",
    "Avoid making public trust, privacy, or accessibility claims on the client’s behalf until the underlying findings are resolved."
  ];

  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-6 py-5">
      <div className="space-y-4">
        <div className="space-y-2">
          <p className="text-base font-semibold text-slate-900">Agency advisory</p>
          <p className="text-sm text-slate-500">
            Read this report as a manager of the client site. Focus on what the site owner needs to understand, what your team should remediate, and where you should keep clear scope boundaries.
          </p>
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">What the client should know</p>
            <ul className="mt-3 space-y-2 text-sm text-slate-700">
              {clientBullets.map((bullet) => (
                <li key={bullet}>• {bullet}</li>
              ))}
            </ul>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">What your agency should do</p>
            <ul className="mt-3 space-y-2 text-sm text-slate-700">
              {agencyBullets.map((bullet) => (
                <li key={bullet}>• {bullet}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

function FindingsOverview(input: { findings: UnifiedFindingDisplayPacket[] }) {
  const sortedFindings = [...input.findings].sort((left, right) => {
    const severityDelta = getScanFindingSeverityWeight(right.severity) - getScanFindingSeverityWeight(left.severity);
    if (severityDelta !== 0) {
      return severityDelta;
    }

    const confidenceWeight = { high: 3, moderate: 2, low: 1 } as const;
    const confidenceDelta = confidenceWeight[right.confidenceBand] - confidenceWeight[left.confidenceBand];
    if (confidenceDelta !== 0) {
      return confidenceDelta;
    }

    return left.presentation.findingName.localeCompare(right.presentation.findingName);
  });
  const highPriorityCount = sortedFindings.filter((finding) => finding.severity === "high").length;
  const mediumPriorityCount = sortedFindings.filter((finding) => finding.severity === "medium").length;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-6 py-5">
      <div className="space-y-4">
        <div className="space-y-2">
          <p className="text-base font-semibold text-slate-900">Findings worth review</p>
          <p className="text-sm text-slate-500">
            Start here. These are the surfaced issues that look worth reviewing with the site owner, ordered to help your team decide what to tackle first.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <span className="rounded-full bg-rose-100 px-3 py-1 text-xs font-medium uppercase tracking-[0.16em] text-rose-800">
            {highPriorityCount} high priority
          </span>
          <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium uppercase tracking-[0.16em] text-amber-800">
            {mediumPriorityCount} medium priority
          </span>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium uppercase tracking-[0.16em] text-slate-700">
            {sortedFindings.length} surfaced finding{sortedFindings.length === 1 ? "" : "s"}
          </span>
        </div>

        {sortedFindings.length > 0 ? (
          <div className="space-y-4">
            {sortedFindings.map((finding) => (
              <div key={`priority-${finding.unifiedFindingId}`} className="space-y-2">
                <ReviewFindingCard finding={finding} />
                <div className="flex flex-wrap gap-3 text-xs text-slate-500">
                  <span>{summarizeEvidence(finding)}</span>
                  <span>{finding.presentationDecision.confidenceRationale}</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-4">
            <p className="text-sm text-slate-600">No surfaced unified findings were promoted for this scan.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function formatReviewFindingSummaryTitle(title: string) {
  const normalized = title
    .replace(/^Possible /i, "")
    .replace(/^Observed /i, "")
    .replace(/\s+detected$/i, "")
    .replace(/\s+present$/i, "")
    .replace(/\s+incidents$/i, "")
    .replace(/\s+candidate$/i, "")
    .trim();

  switch (normalized) {
    case "Pre-consent tracking":
    case "Pre-consent tracking incidents":
      return "Pre-consent tracking";
    case "Session replay tool":
    case "Session replay":
    case "Undisclosed session replay":
      return "Session replay";
    case "Policy-to-behavior conflict":
      return "Policy conflict";
    case "Accessibility claim mismatch":
      return "Claim mismatch";
    case "Store-credit-only remedy":
      return "Store-credit-only remedy";
    case "Low-confidence policy extraction":
      return "Low-confidence extraction";
    default:
      return normalized;
  }
}

function summarizeSectionFindings(findings: UnifiedFindingDisplayPacket[]) {
  if (findings.length === 0) {
    return "No surfaced findings in this section.";
  }

  const labels = findings
    .slice(0, 3)
    .map((finding) => formatReviewFindingSummaryTitle(finding.presentation.findingName));
  const remainder = findings.length - labels.length;

  return `${findings.length} surfaced finding${findings.length === 1 ? "" : "s"}${
    labels.length > 0 ? `: ${labels.join(", ")}${remainder > 0 ? `, +${remainder} more` : ""}` : ""
  }.`;
}

function summarizeSectionFindingCoverage(findings: UnifiedFindingDisplayPacket[]) {
  const findingCount = findings.length;

  if (findingCount === 0) {
    return "No surfaced findings in this section.";
  }

  return summarizeSectionFindings(findings);
}

function getMatrixCountTone(count: number) {
  if (count >= 3) {
    return "bg-rose-100 text-rose-900";
  }
  if (count >= 1) {
    return "bg-amber-100 text-amber-900";
  }
  return "bg-slate-100 text-slate-600";
}

function CoverageMatrix(input: {
  pillarSections: Array<{
    pillar: (typeof REPORT_PRIMARY_PILLARS)[number];
    sections: Array<{
      ownerReviewFindings: UnifiedFindingDisplayPacket[];
      section: ReturnType<typeof getReportSectionsForPillar>[number];
      visibleCategories: Array<{
        category: ReturnType<typeof getReportEvidenceCategoriesForSection>[number];
        items: CanonicalSignalItem[];
      }>;
    }>;
  }>;
}) {
  return (
    <CollapsibleSectionCard
      title="Coverage matrix"
      subtitle="A compact map of where surfaced findings landed across the report taxonomy."
      defaultOpen={false}
      contentClassName="space-y-6"
    >
      {input.pillarSections.map(({ pillar, sections }) => {
        const pillarFindingCount = sections.reduce((sum, section) => sum + section.ownerReviewFindings.length, 0);

        return (
          <div key={pillar.id} className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-slate-900">{pillar.label}</p>
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.12em] ${getMatrixCountTone(pillarFindingCount)}`}>
                {pillarFindingCount} finding{pillarFindingCount === 1 ? "" : "s"}
              </span>
            </div>

            <div className="space-y-3">
              {sections.map(({ ownerReviewFindings, section, visibleCategories }) => (
                <div key={section.id} className="rounded-xl border border-slate-200 bg-white px-4 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-900">{section.label}</p>
                      <p className="mt-1 text-xs text-slate-500">{summarizeSectionFindingCoverage(ownerReviewFindings)}</p>
                    </div>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.12em] ${getMatrixCountTone(ownerReviewFindings.length)}`}>
                      {ownerReviewFindings.length}
                    </span>
                  </div>

                  {visibleCategories.length > 0 ? (
                    <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                      {visibleCategories.map(({ category }) => {
                        const categoryCount = ownerReviewFindings.filter(
                          (finding) => getUnifiedFindingCategoryRelation(finding, category.id) === "owner"
                        ).length;

                        return (
                          <div key={category.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                            <p className="text-sm text-slate-700">{category.label}</p>
                            <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.12em] ${getMatrixCountTone(categoryCount)}`}>
                              {categoryCount > 0 ? `${categoryCount}` : "—"}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </CollapsibleSectionCard>
  );
}

function CanonicalTaxonomyReview(input: CanonicalTaxonomyReviewProps) {
  const validationFindingLookup = buildValidationFindingLookup(input.scanRecord.validationFindings);
  const pillarSections = REPORT_PRIMARY_PILLARS.map((pillar) => {
    const sections = getReportSectionsForPillar(pillar.id)
          .map((section) => {
            const sectionCategoryIds = new Set(
              getReportEvidenceCategoriesForSection(section.id).map((category) => category.id)
            );
            const categories = getReportEvidenceCategoriesForSection(section.id)
              .map((category) => {
                const items = getReportSignalsForEvidenceCategory(category.id)
                  .map(({ relation, signal }) => ({
                    key: signal.key,
                    label: signal.label,
                    relation,
                    source: signal.source,
                    value: getReportSignalValue({
                      policyEnrichment: input.scanRecord.policyEnrichment,
                      runtimeArtifacts: input.scanRecord.runtimeArtifacts,
                      signals: input.scanRecord.signals,
                      snapshot: input.scanRecord.snapshot,
                      signal
                    })
                  }))
                  .filter((item) => isSignalValuePopulated(item.key, item.value))
                  .sort((left, right) => {
                    const relationOrder = { primary: 0, secondary: 1, overlay: 2 } as const;
                    return relationOrder[left.relation] - relationOrder[right.relation] || left.label.localeCompare(right.label);
                  });

                const reviewFindings = buildReviewFindings({
                  categoryId: category.id,
                  issues: [],
                  prioritizedAccessibilityRuleRows: input.prioritizedAccessibilityRuleRows,
                  runtimeArtifacts: input.scanRecord.runtimeArtifacts,
                  sectionId: section.id,
                  sectionItems: items,
                  validationFindingLookup
                });

                return {
                  category,
                  emptySignalCount: getReportSignalsForEvidenceCategory(category.id).length - items.length,
                  items,
                  reviewFindings
                };
              });

            const issues = buildSectionReviewIssues({
              accessibilityIssueRows: input.accessibilityIssueRows,
              consentAuditFindings: input.consentAuditFindings,
              policyBehaviorContradictions: input.policyBehaviorContradictions,
              preconsentViolationRows: input.preconsentViolationRows,
              scanReportReviewIssues: input.scanReportReviewIssues,
              sectionId: section.id,
              snapshot: input.snapshot
            });
            const issueFindings = buildReviewFindings({
              issues,
              prioritizedAccessibilityRuleRows: input.prioritizedAccessibilityRuleRows,
              runtimeArtifacts: input.scanRecord.runtimeArtifacts,
              sectionId: section.id,
              sectionItems: [],
              validationFindingLookup
            });
            const sectionValidationFindings = input.scanRecord.validationFindings.filter((finding) => {
              const mappedFinding =
                getReportUnifiedFindingForValidationRule(finding.ruleKey) ??
                getReportUnifiedFindingByAlias(finding.title);

              return (
                mappedFinding?.categoryAlignments.some((alignment) =>
                  sectionCategoryIds.has(alignment.evidenceCategoryId)
                ) ?? false
              );
            });
            const unifiedFindings = buildUnifiedFindingDisplayPackets({
              reviewFindingCandidates: [...categories.flatMap((category) => category.reviewFindings), ...issueFindings],
              validationFindings: sectionValidationFindings,
              validationFindingLookup
            }).filter((finding) => finding.presentationDecision.status !== "suppress");
            const reviewFindings = unifiedFindings;
            const sectionItems = categories.flatMap((category) => category.items);
            const ownerReviewFindings = reviewFindings.filter((finding) => {
              const ownerCategoryId = finding.categoryAlignments.find((alignment) => alignment.relation === "owner")?.evidenceCategoryId;
              return ownerCategoryId ? sectionCategoryIds.has(ownerCategoryId) : false;
            });
            const visibleCategories = categories.filter(({ category, items }) => {
              const ownerFindingsForCategory = unifiedFindings.filter(
                (finding) => getUnifiedFindingCategoryRelation(finding, category.id) === "owner"
              );
              const mirrorFindingsForCategory = unifiedFindings.filter(
                (finding) => getUnifiedFindingCategoryRelation(finding, category.id) === "mirror"
              );
              const overlayFindingsForCategory = unifiedFindings.filter(
                (finding) => getUnifiedFindingCategoryRelation(finding, category.id) === "overlay"
              );

              return (
                ownerFindingsForCategory.length > 0 ||
                mirrorFindingsForCategory.length > 0 ||
                overlayFindingsForCategory.length > 0 ||
                items.length > 0
              );
            });

            return {
              ownerReviewFindings,
              reviewFindings,
              section,
              sectionItems,
              unifiedFindings,
              visibleCategories
            };
          });
    return { pillar, sections };
  });
  const reviewFindings = [
    ...new Map(
      pillarSections
        .flatMap(({ sections }) => sections.flatMap((section) => section.ownerReviewFindings))
        .map((finding) => [finding.unifiedFindingId, finding])
    ).values()
  ];

  return (
    <div className="space-y-6">
      <AgencyAdvisorySummary findings={reviewFindings} />
      <FindingsOverview findings={reviewFindings} />

      <CoverageMatrix
        pillarSections={pillarSections.map(({ pillar, sections }) => ({
          pillar,
          sections: sections.map(({ ownerReviewFindings, section, visibleCategories }) => ({
            ownerReviewFindings,
            section,
            visibleCategories
          }))
        }))}
      />
    </div>
  );
}

function formatReviewIssueReason(reason: string) {
  switch (reason) {
    case "policy_behavior_conflict_candidate":
      return "Possible policy-to-behavior conflict";
    case "session_replay_without_disclosure_detected":
      return "Possible undisclosed session replay";
    case "missing_dsar_high_exposure":
      return "Possible missing DSAR path";
    case "low_confidence_critical_fields":
      return "Low-confidence policy extraction";
    default:
      return reason.replaceAll("_", " ").replace(/\b\w/g, (char) => char.toUpperCase());
  }
}

function formatReviewIssueDescription(reason: string) {
  switch (reason) {
    case "policy_behavior_conflict_candidate":
      return "Observed site behavior may conflict with the site’s public-facing policy language.";
    case "session_replay_without_disclosure_detected":
      return "Session replay behavior may be present without a clear matching disclosure in the scanned policy pages.";
    case "missing_dsar_high_exposure":
      return "The site may have elevated exposure while still lacking a clear DSAR path in policy disclosures.";
    case "low_confidence_critical_fields":
      return "Critical policy extraction fields were low confidence and need manual review in the scan report.";
    default:
      return `This issue was added to the scan report review queue under ${formatReviewIssueReason(reason)}.`;
  }
}

function getReviewIssueNextStep(issue: CanonicalReviewIssue) {
  if (issue.evidence && issue.evidence.length > 0) {
    return "Review the linked evidence in this section and confirm whether the issue reflects an actual policy or disclosure gap.";
  }

  return "Inspect the supporting signals in this section and confirm whether the issue reflects a real reviewer concern.";
}

function summarizeReviewIssueEvidence(evidence: string[]) {
  if (evidence.length === 1) {
    return evidence[0] ?? "";
  }

  const [first, second] = evidence;
  const remainingCount = evidence.length - 2;

  return remainingCount > 0
    ? `${first} | ${second} | +${remainingCount} more`
    : `${first} | ${second}`;
}

function ResultCategorySection(input: {
  title: string;
  metrics: ResultMetric[];
  details: ResultDetail[];
  defaultOpen?: boolean;
  collapsible?: boolean;
  intro?: string;
  includes?: string;
  collapseDetails?: boolean;
  detailsTitle?: string;
  staticSection?: boolean;
}) {
  const visibleDetails = input.details.filter((detail) => {
    if (detail.value === null || detail.value === undefined || detail.value === "") {
      return false;
    }

    if (Array.isArray(detail.value)) {
      return detail.value.length > 0;
    }

    return true;
  });

  const body = (
    <>
      <div className={METRIC_GRID_CLASS}>
        {input.metrics.map((metric) => (
          <SummaryMetricTile
            key={`${input.title}-${metric.label}`}
            label={metric.label}
            tooltip={metric.tooltip}
            value={metric.value}
          />
        ))}
      </div>

      {visibleDetails.length > 0 ? (
        input.collapseDetails ? (
          <CollapsibleSectionCard title={input.detailsTitle ?? "Detail signals"} defaultOpen={false}>
              <div className={METRIC_GRID_CLASS}>
                {visibleDetails.map((detail) => (
                <SummaryMetricTile
                  key={`${input.title}-${detail.label}`}
                  label={detail.label}
                  value={formatCompactValue(detail.value)}
                />
              ))}
            </div>
          </CollapsibleSectionCard>
        ) : (
          <div className={METRIC_GRID_CLASS}>
            {visibleDetails.map((detail) => (
              <SummaryMetricTile
                key={`${input.title}-${detail.label}`}
                label={detail.label}
                value={formatCompactValue(detail.value)}
              />
            ))}
          </div>
        )
      ) : null}
    </>
  );

  if (input.staticSection) {
    return (
      <StaticSubsection title={input.title} intro={input.intro} tooltip={input.intro}>
        {body}
      </StaticSubsection>
    );
  }

  if (input.collapsible === false) {
    return (
      <SectionSubsection
        title={input.title}
        intro={input.intro}
        tooltip={input.intro}
      >
        {body}
      </SectionSubsection>
    );
  }

  return (
    <CollapsibleSectionCard
      title={
        <span className="flex items-center gap-1.5">
          <span>{input.title}</span>
          {input.intro ? <InfoTip text={input.intro} /> : null}
        </span>
      }
      subtitle={input.intro}
      defaultOpen={input.defaultOpen}
      contentClassName="space-y-4"
    >
      {body}
    </CollapsibleSectionCard>
  );
}

type ScanDetailPageProps = {
  params: Promise<{
    scanId: string;
  }>;
};

export default async function ScanDetailPage({ params }: ScanDetailPageProps) {
  const [{ scanId }, { organization, user }] = await Promise.all([params, getDashboardContext()]);
  const scanRecord = await getScanById({
    organizationId: organization.id,
    scanId,
    viewerEmail: user.email
  });

  if (!scanRecord) {
    notFound();
  }

  const snapshot = scanRecord.snapshot;
  const runtimeArtifacts = scanRecord.runtimeArtifacts;
  const canRescan = scanRecord.scan.status === "completed" && Boolean(scanRecord.scan.domainId);
  const rescanAvailability = canRescan
    ? getRescanAvailability({
        activeScanExists: false,
        lastScannedAt: scanRecord.scan.createdAt,
        planCode: organization.plan
      })
    : null;
  const rescanCooldownMessage =
    canRescan && rescanAvailability
      ? rescanAvailability.reason
        ? rescanAvailability.reason
        : !rescanAvailability.allowed
          ? formatRescanCooldownMessage(rescanAvailability.nextAllowedAt, organization.plan)
          : null
      : null;
  let reviewSectionError: string | null = null;
  let scanReportReviewIssues: CanonicalTaxonomyReviewProps["scanReportReviewIssues"] = [];
  let preconsentViolationRows: ReturnType<typeof derivePreconsentViolationRows> = [];
  let policyBehaviorContradictions: PolicyBehaviorContradiction[] = [];
  let consentAuditFindings: PreviewSampleFinding[] = [];
  let accessibilityIssueRows: ReturnType<typeof deriveAccessibilityIssueRows> = [];
  let accessibilityRuleEvidenceRows: ReturnType<typeof deriveAccessibilityRuleEvidenceRows> = [];
  let prioritizedAccessibilityRuleRows: ReturnType<typeof deriveAccessibilityRuleEvidenceRows> = [];
  let taxonomySnapshotSections: Array<{ description: string; fields: string[]; title: string }> = [];

  try {
    const policyEnrichmentById = new Map(
      scanRecord.policyEnrichment.map((row) => [String(row.id ?? ""), row])
    );
    scanReportReviewIssues = scanRecord.policyReviewQueue.map((row, index) => {
      const enrichment = policyEnrichmentById.get(String(row.policyEnrichmentId ?? row.policy_enrichment_id ?? "")) ?? null;

      return {
        description: formatReviewIssueDescription(String(row.reason ?? "")),
        key: String(row.id ?? `${row.reason ?? "review"}-${index}`),
        pageType: String(enrichment?.pageType ?? enrichment?.page_type ?? "unknown"),
        pageUrl:
          typeof (enrichment?.pageUrl ?? enrichment?.page_url) === "string"
            ? String(enrichment?.pageUrl ?? enrichment?.page_url)
            : null,
        reason: String(row.reason ?? ""),
        reviewStatus: String(row.reviewStatus ?? row.review_status ?? "pending"),
        reviewVerdict: row.reviewVerdict ?? row.review_verdict ?? null,
        summary: enrichment?.policySummaryShort ?? enrichment?.policy_summary_short ?? null
      };
    });
    preconsentViolationRows = derivePreconsentViolationRows({
      persistedViolations: scanRecord.preconsentViolations,
      runtimeArtifacts,
      trackerVendors: scanRecord.trackerVendors
    });
    policyBehaviorContradictions = derivePolicyBehaviorContradictions({
      policyEnrichments: scanRecord.policyEnrichment,
      preconsentViolations: preconsentViolationRows,
      runtimeArtifacts,
      snapshot,
      trackerVendors: scanRecord.trackerVendors
    });
    consentAuditFindings = dedupeHeadlineFindings(deriveConsentAuditFindings(snapshot, runtimeArtifacts));
    accessibilityIssueRows = snapshot ? deriveAccessibilityIssueRows(snapshot) : [];
    accessibilityRuleEvidenceRows = deriveAccessibilityRuleEvidenceRows({
      examples: scanRecord.accessibilityRuleExamples ?? [],
      ruleCounts: scanRecord.accessibilityRuleCounts ?? []
    });
    prioritizedAccessibilityRuleRows = [...accessibilityRuleEvidenceRows]
      .sort((left, right) => right.weightedPriority - left.weightedPriority)
      .slice(0, 6);
    taxonomySnapshotSections = snapshot
      ? groupSnapshotFieldsByPrimaryCategory(Object.keys(snapshot)).map((group) => ({
          title: group.category.label,
          description: group.category.description,
          fields: group.entries.map((entry) => entry.key)
        }))
      : [];
  } catch (error) {
    reviewSectionError = error instanceof Error ? error.message : "Unknown error";
    console.error("Failed to prepare scan review sections", error);
  }

  const preConsentTrackingObserved =
    snapshot?.preconsent_tracking_detected === true ||
    snapshot?.tracking_before_consent_detected === true ||
    hasTruthySignal(scanRecord.signals, "tracking_before_consent_detected") ||
    hasTruthySignal(scanRecord.signals, "preconsent_tracking_detected") ||
    hasTruthySignal(scanRecord.signals, "third_party_cookie_set_before_consent");
  const consentAuditCompleted = getRecordBoolean(runtimeArtifacts, "consent_audit_completed");
  const consentRejectInteractionSucceeded = getRecordBoolean(runtimeArtifacts, "consent_reject_interaction_succeeded");
  const consentAcceptInteractionSucceeded = getRecordBoolean(runtimeArtifacts, "consent_accept_interaction_succeeded");
  const consentRejectReducedTracking = runtimeArtifacts?.consent_reject_reduced_tracking;
  const consentRejectReducedThirdPartyCookies = runtimeArtifacts?.consent_reject_reduced_third_party_cookies;
  const consentBaselineCookieCount = getRecordNumber(runtimeArtifacts, "consent_baseline_cookie_count");
  const consentPostRejectCookieCount = getRecordNumber(runtimeArtifacts, "consent_post_reject_cookie_count");
  const consentPreconsentViolationCount = getRecordNumber(runtimeArtifacts, "consent_preconsent_violation_count");
  const consentBaselineTrackerEvidenceUrls = getRecordStringArray(runtimeArtifacts, "consent_baseline_tracker_evidence_urls");
  const consentBaselineTrackerVendors = getRecordStringArray(runtimeArtifacts, "consent_baseline_tracker_vendor_names");
  const consentPostRejectTrackerVendors = getRecordStringArray(runtimeArtifacts, "consent_post_reject_tracker_vendor_names");
  const consentPostRejectTrackerEvidenceUrls = getRecordStringArray(runtimeArtifacts, "consent_post_reject_tracker_evidence_urls");
  const consentRejectPersistedTrackerVendors = getRecordStringArray(
    runtimeArtifacts,
    "consent_reject_persisted_tracker_vendor_names"
  );
  const consentRejectNewTrackerVendors = getRecordStringArray(runtimeArtifacts, "consent_reject_new_tracker_vendor_names");
  const consentAcceptNewTrackerVendors = getRecordStringArray(runtimeArtifacts, "consent_accept_new_tracker_vendor_names");
  const consentPostAcceptTrackerEvidenceUrls = getRecordStringArray(runtimeArtifacts, "consent_post_accept_tracker_evidence_urls");
  const privacyLegalSectionScore = averageNumbers([
    getFiniteNumber(snapshot?.privacy_score),
    getFiniteNumber(snapshot?.legal_coverage_score)
  ]);
  const cookieConsentSectionScore = getFiniteNumber(snapshot?.consent_score);
  const trackerSectionScore = averageNumbers([
    invertRiskScore(snapshot?.tracker_risk_score),
    invertRiskScore(snapshot?.data_collection_risk_score)
  ]);
  const preconsentSectionScore = derivePreconsentSectionScore({
    consentAuditCompleted,
    consentRejectReducedTracking,
    preConsentTrackingObserved,
    preconsentViolationCount: consentPreconsentViolationCount
  });
  const accessibilityConsumerSectionScore = averageNumbers([
    getFiniteNumber(snapshot?.accessibility_score),
    getFiniteNumber(snapshot?.consumer_protection_score)
  ]);
  const scanExecutionSummary = deriveScanExecutionSummary({
    accessibilityRuleCountTotal: scanRecord.accessibilityRuleCounts.length,
    consentAuditCompleted,
    consentPreconsentViolationCount,
    errorMessage: scanRecord.scan.errorMessage,
    events: scanRecord.events,
    keyPageDiscoverySummary:
      runtimeArtifacts && typeof runtimeArtifacts === "object" ? (runtimeArtifacts.key_page_discovery_summary ?? null) : null,
    pagesRequested: scanRecord.scan.pagesRequested,
    pagesScanned: scanRecord.scan.pagesScanned,
    preconsentTrackingDetected: snapshot?.preconsent_tracking_detected === true,
    renderModeUsed: typeof snapshot?.render_mode_used === "string" ? snapshot.render_mode_used : null,
    status: scanRecord.scan.status,
    timeoutFlag: snapshot?.timeout_flag === true,
    trackingBeforeConsentDetected: snapshot?.tracking_before_consent_detected === true,
    trackerEvidenceUrlCount: consentBaselineTrackerEvidenceUrls.length,
    wcagErrorCountTotal: getRecordNumber(snapshot, "wcag_error_count_total")
  });
  return (
    <div className="min-w-0 overflow-x-hidden space-y-8">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="space-y-3">
          <Badge tone={scanRecord.scan.status === "completed" ? "success" : "warning"}>
            {formatStatus(scanRecord.scan.status)}
          </Badge>
          <div className="flex flex-wrap items-end gap-3">
            <h1 className="text-3xl font-semibold tracking-tight">
              Scan: {scanRecord.scan.domainHostname ?? "Unknown website"}
            </h1>
            <span className="text-sm font-normal text-slate-400">
              Created {formatDateTime(scanRecord.scan.createdAt)}
            </span>
          </div>
          <ScanStatusAutoRefresh status={scanRecord.scan.status} />
        </div>
        <ScanViewActions
          alternateHref={`/app/scans/${scanRecord.scan.id}/json`}
          alternateLabel="json-view"
          canRescan={canRescan && Boolean(scanRecord.scan.domainId) && Boolean(rescanAvailability)}
          cooldownMessage={rescanCooldownMessage}
          domainId={scanRecord.scan.domainId}
          rescanDisabled={Boolean(rescanAvailability && !rescanAvailability.allowed)}
        />
      </div>
      {snapshot ? (
        <ReportExecutiveSummary
          titleTooltip="These ratings mirror the five primary evidence sections and use a 0.0 to 5.0 higher-is-better scale."
          statusCallout={
            scanExecutionSummary
              ? {
                  title: scanExecutionSummary.title,
                  details: scanExecutionSummary.details,
                  tone: scanExecutionSummary.tone
                }
              : null
          }
          metrics={[
            {
              label: "Privacy & disclosure",
              tooltip:
                "Combined 1 to 5 section rating for privacy-policy quality, policy-page coverage, and consumer-facing disclosure posture.",
              value: formatRating(privacyLegalSectionScore)
            },
            {
              label: "Consent",
              tooltip:
                "Combined 1 to 5 section rating for banner visibility, choice quality, CMP posture, and consent-flow behavior.",
              value: formatRating(cookieConsentSectionScore)
            },
            {
              label: "Trackers",
              tooltip:
                "Combined 1 to 5 section rating for tracker risk, third-party collection surface, and the observed vendor ecosystem.",
              value: formatRating(trackerSectionScore)
            },
            {
              label: "Pre-consent",
              tooltip:
                "Combined 1 to 5 section rating for whether trackers fired before consent and whether the consent audit showed enforcement failures.",
              value: formatRating(preconsentSectionScore)
            },
            {
              label: "Accessibility & consumer",
              tooltip:
                "Combined 1 to 5 section rating for accessibility posture, WCAG-oriented findings, and broader consumer-facing signals.",
              value: formatRating(accessibilityConsumerSectionScore)
            }
          ]}
          badges={[
            ...(policyBehaviorContradictions.length > 0
              ? [
                  {
                    label: `${policyBehaviorContradictions.length} contradiction${policyBehaviorContradictions.length === 1 ? "" : "s"}`,
                    tone: "warning" as const,
                    tooltip:
                      "Number of policy-versus-behavior contradictions surfaced from comparing public claims with observed runtime behavior."
                  }
                ]
              : []),
            ...((consentPreconsentViolationCount ?? 0) > 0
              ? [
                  {
                    label: `${consentPreconsentViolationCount} pre-consent conflict${consentPreconsentViolationCount === 1 ? "" : "s"}`,
                    tone: "warning" as const,
                    tooltip:
                      "Number of tracker vendors with persisted evidence showing they fired before a consent interaction was completed."
                  }
                ]
              : []),
            ...(consentAuditCompleted
              ? [
                  {
                    label: `reject ${
                      consentRejectReducedTracking === false
                        ? "failed"
                        : consentRejectReducedTracking === true
                          ? "reduced tracking"
                          : "audit completed"
                    }`,
                    tooltip:
                      "Outcome of the consent interaction audit after attempting a reject path. This shows whether tracking activity actually changed after the choice."
                  }
                ]
              : [])
          ]}
        />
      ) : null}

      {snapshot ? (
        <>
          {reviewSectionError ? (
            <ScanSectionFallback
              title="Review sections unavailable"
              message={`The live scan loaded, but the structured review sections could not be prepared for this scan. ${reviewSectionError}`}
            />
          ) : (
            renderCanonicalTaxonomyReviewSafely({
              accessibilityIssueRows,
              consentAuditFindings,
              policyBehaviorContradictions,
              preconsentViolationRows,
              prioritizedAccessibilityRuleRows,
              scanRecord,
              scanReportReviewIssues,
              snapshot
            })
          )}
        </>
      ) : null}


      <CollapsibleSectionCard
        title={
          <span className="flex items-center gap-1.5">
            <span>Advanced diagnostics</span>
            <InfoTip text="Raw scan records, execution metadata, and lower-level evidence retained for deeper review or troubleshooting. This area is intentionally schema-heavier than the primary result sections above." />
          </span>
        }
        contentClassName="space-y-6"
      >
        {snapshot ? (
          <CollapsibleSectionCard
            title={
              <span className="flex items-center gap-1.5">
                <span>AI, Automation & Emerging Practices</span>
                <InfoTip text="AI assistants, automation disclosures, AI answer experiences, and related emerging-practice signals kept in diagnostics for research and lower-priority review." />
              </span>
            }
          >
            <ResultCategorySection
              title={PRIMARY_SCAN_CATEGORY_META.ai_automation_emerging_practices.label}
              collapsible={false}
              metrics={[
                {
                  label: "AI chatbot",
                  value: formatCompactValue(snapshot.ai_chatbot_present),
                  tooltip:
                    "Whether the scan detected a likely visible chatbot or assistant experience based on vendor signatures, widget markers, and explicit assistant language."
                },
                {
                  label: "AI vendor",
                  value: formatCompactValue(snapshot.ai_chatbot_vendor),
                  tooltip:
                    "The strongest visible AI or chat-assistant vendor signature detected on the site during the scan, if any."
                },
                {
                  label: "AI disclosure",
                  value: formatCompactValue(snapshot.ai_disclosure_text_present),
                  tooltip:
                    "Whether visible page text suggested explicit AI-related disclosure language such as AI-generated responses, powered by AI, or automated assistant messaging."
                },
                {
                  label: "AI search/answers",
                  value: formatCompactValue(snapshot.ai_search_or_answer_experience_detected),
                  tooltip:
                    "Whether the scan detected a clearly AI-labeled question-to-answer or instant-answer experience, beyond generic site search."
                }
              ]}
              details={[
                { label: "AI assistant widget", value: snapshot.ai_assistant_widget_detected },
                { label: "AI policy reference", value: snapshot.ai_terms_or_policy_ai_reference },
                { label: "AI help-center reference", value: snapshot.ai_help_center_ai_reference },
                { label: "Hiring automation signal", value: snapshot.ai_hiring_automation_signal_detected }
              ]}
            />
          </CollapsibleSectionCard>
        ) : null}

        {snapshot ? (
          <ResultCategorySection
            title={PRIMARY_SCAN_CATEGORY_META.security_trust_governance.label}
            intro={PRIMARY_SCAN_CATEGORY_META.security_trust_governance.description}
            includes="Transport and headers, DNS authentication, trust and disclosure pages, and incident or vulnerability transparency signals."
            collapsible={false}
            metrics={[
              {
                label: "TLS minimum",
                value: formatCompactValue(snapshot.tls_version_min_supported),
                tooltip:
                  "The minimum TLS protocol version observed or inferred for the site, used as a basic indicator of transport security posture."
              },
              {
                label: "HSTS",
                value: formatCompactValue(snapshot.hsts_enabled),
                tooltip:
                  "Whether HTTP Strict Transport Security was observed, which helps enforce HTTPS usage in supported browsers."
              },
              {
                label: "CSP",
                value: formatCompactValue(snapshot.csp_header_present),
                tooltip:
                  "Whether a Content Security Policy header was observed, which is a basic indicator of script and resource-loading controls."
              },
              {
                label: "DMARC",
                value: formatCompactValue(snapshot.dmarc_record_present),
                tooltip:
                  "Whether a DMARC record was detected for the domain, which is a useful public signal of email authentication governance."
              }
            ]}
            details={[
              { label: "Permissions policy", value: snapshot.permissions_policy_present },
              { label: "security.txt", value: snapshot.security_txt_present },
              { label: "Vulnerability disclosure page", value: snapshot.vulnerability_disclosure_page_present },
              { label: "Trust center", value: snapshot.trust_center_present },
              { label: "Incident status page", value: snapshot.incident_status_page_present },
              { label: "DNSSEC", value: snapshot.dnssec_enabled },
              { label: "SPF", value: snapshot.spf_record_present },
              { label: "DKIM", value: snapshot.dkim_record_detected },
              { label: "Certificate authority", value: snapshot.certificate_authority },
              { label: "Security posture changed", value: snapshot.security_header_posture_changed },
              { label: "Infrastructure changed", value: snapshot.infrastructure_change_detected },
              { label: "Country inferred", value: snapshot.country_inferred },
              { label: "Jurisdiction guess", value: snapshot.jurisdiction_guess }
            ]}
          />
        ) : null}

        <CollapsibleSectionCard
          title={
            <span className="flex items-center gap-1.5">
              <span>Raw signals</span>
              <InfoTip text="The active structured signals persisted for this scan. These normalized flags and counts drive the downstream summaries and scores." />
            </span>
          }
        >
          {scanRecord.signals.length === 0 ? (
            <p className="text-sm text-slate-600">No structured signals are available for this scan yet.</p>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {scanRecord.signals.map((signal, index) => (
                <div key={`${signal.key}:${index}`} className="rounded-2xl border border-slate-200 p-4">
                  <p className="font-medium text-slate-900">{signal.label}</p>
                  <p className="mt-1 text-sm text-slate-500">{signal.primaryCategoryLabel}{signal.subcategory ? ` · ${signal.subcategory}` : ""}</p>
                  <p className="mt-3 text-sm text-slate-700">
                    {Array.isArray(signal.value) ? signal.value.join(", ") : String(signal.value)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </CollapsibleSectionCard>

        {snapshot ? (
          <div className="grid gap-6 xl:grid-cols-2">
            {OPERATIONAL_SNAPSHOT_SECTIONS.map((section) => (
              <CollapsibleSectionCard
                key={section.title}
                title={
                  <span className="flex items-center gap-1.5">
                    <span>{section.title}</span>
                    <InfoTip text={SNAPSHOT_SECTION_HELP[section.title] ?? "Structured snapshot fields persisted for this area of the scan."} />
                  </span>
                }
                contentClassName="space-y-2 text-sm"
              >
                {section.fields.map((field) => (
                  <div key={field} className="flex items-start justify-between gap-4 border-b border-slate-100 py-2 last:border-b-0">
                    <span className="font-medium text-slate-700">{field}</span>
                    <span className="max-w-[60%] text-right text-slate-600">{formatValue(snapshot[field])}</span>
                  </div>
                ))}
              </CollapsibleSectionCard>
            ))}

            {taxonomySnapshotSections.map((section) => (
              <CollapsibleSectionCard
                key={section.title}
                title={
                  <span className="flex items-center gap-1.5">
                    <span>{section.title}</span>
                    <InfoTip text={section.description} />
                  </span>
                }
                contentClassName="space-y-2 text-sm"
              >
                {section.fields.map((field) => (
                  <div key={field} className="flex items-start justify-between gap-4 border-b border-slate-100 py-2 last:border-b-0">
                    <span className="font-medium text-slate-700">{field}</span>
                    <span className="max-w-[60%] text-right text-slate-600">{formatValue(snapshot[field])}</span>
                  </div>
                ))}
              </CollapsibleSectionCard>
            ))}
          </div>
        ) : null}

        {snapshot ? (
          <CollapsibleSectionCard
            title={
              <span className="flex items-center gap-1.5">
                <span>Accessibility metrics</span>
                <InfoTip text="Automated accessibility metrics and related public-facing accessibility signals detected during this scan." />
              </span>
            }
            contentClassName="grid gap-2 text-sm text-slate-600 md:grid-cols-2 xl:grid-cols-4"
          >
            <p>Accessibility score: {formatValue(snapshot.accessibility_score)}</p>
            <p>Automated score: {formatValue(snapshot.accessibility_score_automated)}</p>
            <p>WCAG errors: {formatValue(snapshot.wcag_error_count_total)}</p>
            <p>WCAG warnings: {formatValue(snapshot.wcag_warning_count_total)}</p>
            <p>Missing alt text: {formatValue(snapshot.wcag_missing_alt_count)}</p>
            <p>Form label issues: {formatValue(snapshot.wcag_form_label_error_count)}</p>
            <p>Keyboard issues: {formatValue(snapshot.wcag_keyboard_navigation_issue_count)}</p>
            <p>Claim mismatch detected: {formatValue(snapshot.accessibility_claim_mismatch_detected)}</p>
            <p>Accessibility statement present: {formatValue(snapshot.accessibility_statement_present)}</p>
            <p>Accessibility contact present: {formatValue(snapshot.accessibility_contact_method_present)}</p>
            <p>Widget present: {formatValue(snapshot.accessibility_widget_present)}</p>
            <p>Accessibility risk score: {formatValue(snapshot.accessibility_litigation_risk_score)}</p>
          </CollapsibleSectionCard>
        ) : null}

        {runtimeArtifacts ? (
          <CollapsibleSectionCard
            title={
              <span className="flex items-center gap-1.5">
                <span>Runtime evidence</span>
                <InfoTip text="Compact browser-run evidence such as request domains, cookie counts, script domains, and DOM summary fields. Raw HTML and screenshots are not stored." />
              </span>
            }
            contentClassName="grid gap-2 text-sm text-slate-600 md:grid-cols-2 xl:grid-cols-4"
          >
            <p>Third-party request count: {formatValue(runtimeArtifacts.third_party_request_count)}</p>
            <p>Third-party request domains: {formatValue(runtimeArtifacts.third_party_request_domains)}</p>
            <p>Initial cookie count: {formatValue(runtimeArtifacts.initial_cookie_count)}</p>
            <p>Initial cookie names: {formatValue(runtimeArtifacts.initial_cookie_names)}</p>
            <p>Script tag count: {formatValue(runtimeArtifacts.script_tag_count)}</p>
            <p>Script source domains: {formatValue(runtimeArtifacts.script_src_domains)}</p>
            <p>DOM node count: {formatValue(runtimeArtifacts.dom_node_count)}</p>
            <p>DOM structure hash: {formatValue(runtimeArtifacts.dom_structure_hash)}</p>
          </CollapsibleSectionCard>
        ) : null}

      </CollapsibleSectionCard>
    </div>
  );
}
