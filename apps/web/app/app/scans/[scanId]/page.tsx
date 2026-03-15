import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import type { FetchStatus, PreviewSampleFinding } from "@website-signal-risk-scanner/shared";
import { Badge } from "@website-signal-risk-scanner/ui";
import { CollapsibleSectionCard } from "../../../../components/scans/collapsible-section-card";
import { FullScanProgressCard } from "../../../../components/scans/full-scan-progress-card";
import { InfoTip } from "../../../../components/scans/info-tip";
import { PolicyEnrichmentSection } from "../../../../components/scans/policy-enrichment-section";
import { RegulatoryRiskSection } from "../../../../components/scans/regulatory-risk-section";
import { ScanStatusAutoRefresh } from "../../../../components/scans/scan-status-auto-refresh";
import {
  getPrimaryCategoryDescription,
  getPrimaryCategoryLabel,
  groupSnapshotFieldsByPrimaryCategory,
  PRIMARY_SCAN_CATEGORY_META
} from "../../../../lib/scans/signal-taxonomy";
import {
  formatCollectionEndpointType,
  formatTrackerRiskLabel,
  formatTrackerSeverityLabel,
  getTrackerRiskLabels,
  getTrackerSeverity
} from "../../../../lib/scans/tracker-risk";
import { getDashboardContext } from "../../../../server/auth";
import { buildPreviewPayloadFromSnapshot } from "../../../../server/preview-scan/build-preview-payload";
import { getScanById } from "../../../../server/scans/get-scan-by-id";

function formatDateTime(value: string | null) {
  if (!value) {
    return "Not available";
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function formatStatus(status: string) {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function formatEventMetadata(metadata: unknown) {
  if (metadata == null) {
    return "—";
  }

  if (Array.isArray(metadata)) {
    return metadata.slice(0, 3).map((value) => String(value)).join(", ") || "—";
  }

  if (typeof metadata !== "object") {
    return String(metadata);
  }

  const entries = Object.entries(metadata);

  if (entries.length === 0) {
    return "—";
  }

  return entries
    .slice(0, 3)
    .map(([key, value]) => `${key}=${Array.isArray(value) ? value.join(",") : String(value)}`)
    .join(" · ");
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

function formatConfidence(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "—";
  }

  return value.toFixed(2);
}

function getSnapshotNumber(snapshot: Record<string, unknown>, key: string) {
  const value = snapshot[key];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function getSnapshotBoolean(snapshot: Record<string, unknown>, key: string) {
  return snapshot[key] === true;
}

function getSnapshotFetchStatus(snapshot: Record<string, unknown>, key: string): FetchStatus | null {
  const value = snapshot[key];
  if (
    value === "ok" ||
    value === "redirected" ||
    value === "blocked" ||
    value === "timeout" ||
    value === "not_found" ||
    value === "forbidden" ||
    value === "error" ||
    value === "skipped"
  ) {
    return value;
  }

  return null;
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

function deriveAccessibilityIssueChangeRows(input: {
  currentSnapshot: Record<string, unknown> | null;
  previousSnapshot: Record<string, unknown> | null;
}) {
  if (!input.currentSnapshot || !input.previousSnapshot) {
    return [];
  }

  const fields = [
    { key: "contrast", label: "Contrast failures", field: "wcag_contrast_failures_count" },
    { key: "alt", label: "Missing alt text", field: "wcag_missing_alt_count" },
    { key: "navigation", label: "Keyboard issues", field: "wcag_keyboard_navigation_issue_count" },
    { key: "aria", label: "ARIA problems", field: "wcag_aria_error_count" },
    { key: "labels", label: "Form label issues", field: "wcag_form_label_error_count" }
  ] as const;

  return fields
    .map((entry) => {
      const current = getSnapshotNumber(input.currentSnapshot!, entry.field);
      const previous = getSnapshotNumber(input.previousSnapshot!, entry.field);
      const delta = current - previous;

      if (delta === 0) {
        return null;
      }

      return {
        ...entry,
        current,
        delta,
        previous
      };
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row))
    .sort((left, right) => Math.abs(right.delta) - Math.abs(left.delta));
}

function derivePreviewFindingsFromSnapshotRecord(
  snapshot: Record<string, unknown>,
  input: { hostname: string; normalizedUrl: string; pagesScanned: number }
) {
  return buildPreviewPayloadFromSnapshot({
    hostname: input.hostname,
    normalizedUrl: input.normalizedUrl,
    snapshot: {
      accessibilityScore: getSnapshotNumber(snapshot, "accessibility_score"),
      certscoreOverall: getSnapshotNumber(snapshot, "certscore_overall"),
      contactPagePresent: getSnapshotBoolean(snapshot, "contact_page_present"),
      cookieBannerPresent: getSnapshotBoolean(snapshot, "cookie_banner_present"),
      granularPreferencesPresent: getSnapshotBoolean(snapshot, "granular_preferences_present"),
      homepageFetchStatus: getSnapshotFetchStatus(snapshot, "homepage_fetch_status"),
      pagesScanned: input.pagesScanned,
      partialScan: getSnapshotBoolean(snapshot, "partial_scan"),
      privacyPolicyPresent: getSnapshotBoolean(snapshot, "privacy_policy_present"),
      privacyScore: getSnapshotNumber(snapshot, "privacy_score"),
      preconsentTrackingDetected: getSnapshotBoolean(snapshot, "preconsent_tracking_detected"),
      rejectAllPresent: getSnapshotBoolean(snapshot, "reject_all_present"),
      termsOfServicePresent: getSnapshotBoolean(snapshot, "terms_of_service_present"),
      thirdPartyCookieSetBeforeConsent: getSnapshotBoolean(snapshot, "third_party_cookie_set_before_consent"),
      totalSignals: getSnapshotNumber(snapshot, "total_signals"),
      trackingBeforeConsentDetected: getSnapshotBoolean(snapshot, "tracking_before_consent_detected"),
      wcagFormLabelErrorCount: getSnapshotNumber(snapshot, "wcag_form_label_error_count"),
      wcagMissingAltCount: getSnapshotNumber(snapshot, "wcag_missing_alt_count")
    }
  }).sampleFindings;
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

function getExecutionPlan(scanConfigJson: Record<string, unknown> | null) {
  const execution =
    scanConfigJson && typeof scanConfigJson.execution === "object" && scanConfigJson.execution !== null
      ? (scanConfigJson.execution as Record<string, unknown>)
      : null;
  const scanPlan =
    execution && typeof execution.scanPlan === "object" && execution.scanPlan !== null
      ? (execution.scanPlan as Record<string, unknown>)
      : null;

  return {
    pagesRequested: typeof execution?.pagesRequested === "number" ? execution.pagesRequested : null,
    profile: typeof scanPlan?.profile === "string" ? scanPlan.profile : null,
    prefetchTargetCount: typeof scanPlan?.prefetchTargetCount === "number" ? scanPlan.prefetchTargetCount : null,
    expansionTargetCount: typeof scanPlan?.expansionTargetCount === "number" ? scanPlan.expansionTargetCount : null,
    staticFetchConcurrency: typeof scanPlan?.staticFetchConcurrency === "number" ? scanPlan.staticFetchConcurrency : null,
    browserNavigationTimeoutMs:
      typeof scanPlan?.browserNavigationTimeoutMs === "number" ? scanPlan.browserNavigationTimeoutMs : null,
    browserPostLoadWaitMs: typeof scanPlan?.browserPostLoadWaitMs === "number" ? scanPlan.browserPostLoadWaitMs : null,
    blockStylesheetsInBrowser:
      typeof scanPlan?.blockStylesheetsInBrowser === "boolean" ? scanPlan.blockStylesheetsInBrowser : null
  };
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

const METRIC_GRID_CLASS = "grid gap-2 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4";
const METRIC_CARD_CLASS = "rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2.5";
const METRIC_CARD_VALUE_CLASS = "mt-1 text-sm font-semibold text-slate-950";
const EMPHASIS_METRIC_CARD_CLASS = "rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2.5";
const EMPHASIS_METRIC_CARD_VALUE_CLASS = "mt-1 text-sm font-semibold text-amber-950";

function SectionSubsection(input: {
  title: string;
  intro?: string;
  tooltip?: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <CollapsibleSectionCard
      title={
        <span className="flex items-center gap-1.5">
          <span>{input.title}</span>
          {input.tooltip ? <InfoTip text={input.tooltip} /> : null}
        </span>
      }
      subtitle={input.intro}
      defaultOpen={input.defaultOpen ?? true}
      contentClassName="space-y-4"
    >
      {input.children}
    </CollapsibleSectionCard>
  );
}

function StaticSubsection(input: {
  title: string;
  intro?: string;
  tooltip?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
      <div className="space-y-1">
        <div className="flex items-center gap-1.5">
          <p className="text-sm font-medium text-slate-900">{input.title}</p>
          {input.tooltip ? <InfoTip text={input.tooltip} /> : null}
        </div>
        {input.intro ? <p className="text-sm text-slate-600">{input.intro}</p> : null}
      </div>
      {input.children}
    </div>
  );
}

function TopLevelEvidenceSection(input: {
  title: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="space-y-4 rounded-2xl border border-slate-200 bg-white px-6 py-5">
      <div className="flex items-center gap-1.5">
        <p className="text-base font-semibold text-slate-900">{input.title}</p>
      </div>
      {input.children}
    </section>
  );
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
          <div key={`${input.title}-${metric.label}`} className={METRIC_CARD_CLASS}>
            <div className="flex items-center gap-1.5">
              <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500">{metric.label}</p>
              <InfoTip align="start" text={metric.tooltip} />
            </div>
            <p className={METRIC_CARD_VALUE_CLASS}>{metric.value}</p>
          </div>
        ))}
      </div>

      {visibleDetails.length > 0 ? (
        input.collapseDetails ? (
          <CollapsibleSectionCard title={input.detailsTitle ?? "Detail signals"} defaultOpen={false}>
              <div className={METRIC_GRID_CLASS}>
                {visibleDetails.map((detail) => (
                <div key={`${input.title}-${detail.label}`} className={METRIC_CARD_CLASS}>
                  <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500">{detail.label}</p>
                  <p className={METRIC_CARD_VALUE_CLASS}>{formatCompactValue(detail.value)}</p>
                </div>
              ))}
            </div>
          </CollapsibleSectionCard>
        ) : (
          <div className={METRIC_GRID_CLASS}>
            {visibleDetails.map((detail) => (
              <div key={`${input.title}-${detail.label}`} className={METRIC_CARD_CLASS}>
                <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500">{detail.label}</p>
                <p className={METRIC_CARD_VALUE_CLASS}>{formatCompactValue(detail.value)}</p>
              </div>
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
  const [{ scanId }, { organization }] = await Promise.all([params, getDashboardContext()]);
  const scanRecord = await getScanById({
    organizationId: organization.id,
    scanId
  });

  if (!scanRecord) {
    notFound();
  }

  const snapshot = scanRecord.snapshot;
  const runtimeArtifacts = scanRecord.runtimeArtifacts;
  const isInProgress = scanRecord.scan.status === "queued" || scanRecord.scan.status === "running";
  const executionPlan = getExecutionPlan(scanRecord.scan.scanConfigJson);
  const previewDerivedFindings = snapshot
    ? derivePreviewFindingsFromSnapshotRecord(snapshot, {
        hostname: scanRecord.scan.domainHostname ?? "Unknown website",
        normalizedUrl: `https://${scanRecord.scan.domainHostname ?? ""}`,
        pagesScanned: scanRecord.scan.pagesScanned
      })
    : [];
  const relatedPreviewFindings =
    previewDerivedFindings.length === 0 && scanRecord.relatedPreviewSnapshot
      ? derivePreviewFindingsFromSnapshotRecord(scanRecord.relatedPreviewSnapshot, {
          hostname: scanRecord.scan.domainHostname ?? "Unknown website",
          normalizedUrl: `https://${scanRecord.scan.domainHostname ?? ""}`,
          pagesScanned: scanRecord.scan.pagesScanned
        })
      : [];
  const consentAuditFindings = deriveConsentAuditFindings(snapshot, runtimeArtifacts);
  const signalDerivedFindings =
    previewDerivedFindings.length === 0
      ? [
          hasTruthySignal(scanRecord.signals, "tracking_before_consent_detected") ||
          hasTruthySignal(scanRecord.signals, "preconsent_tracking_detected") ||
          hasTruthySignal(scanRecord.signals, "third_party_cookie_set_before_consent")
            ? {
                affectedPage: "Homepage",
                category: "privacy",
                severity: "high",
                title: "Tracking activity observed before consent",
                description:
                  "The live scan observed tracking signals or third-party cookies before a clear consent interaction point was completed."
              }
            : null
        ].filter((finding): finding is PreviewSampleFinding => Boolean(finding))
      : [];
  const trackerRiskSummaryFindings =
    previewDerivedFindings.length === 0
      ? [
          scanRecord.trackerVendors.some((tracker) => tracker.vendorCategory === "session_replay")
            ? {
                affectedPage: "Observed pages",
                category: "privacy",
                severity: "high",
                title: "Session replay tooling detected",
                description:
                  "Session replay or behavior-analytics infrastructure was observed in the tracker inventory, which is typically higher sensitivity than basic analytics."
              }
            : null,
          scanRecord.trackerVendors.filter((tracker) => tracker.vendorCategory === "advertising").length >= 2
            ? {
                affectedPage: "Observed pages",
                category: "privacy",
                severity: "medium",
                title: "Multi-vendor advertising stack detected",
                description:
                  "Multiple advertising or retargeting vendors were observed, indicating broader third-party data-sharing and adtech activity."
              }
            : null,
          scanRecord.trackerVendors.some((tracker) => tracker.collectionEndpointType === "first_party_collection_proxy")
            ? {
                affectedPage: "Observed pages",
                category: "privacy",
                severity: "high",
                title: "First-party collection proxy detected",
                description:
                  "At least one tracker appeared to collect through a first-party endpoint rather than a direct third-party hostname, which can make third-party collection less obvious from a simple hostname review."
              }
            : null
        ].filter((finding): finding is PreviewSampleFinding => Boolean(finding))
      : [];
  const preconsentViolationRows = derivePreconsentViolationRows({
    persistedViolations: scanRecord.preconsentViolations,
    runtimeArtifacts,
    trackerVendors: scanRecord.trackerVendors
  });
  const policyBehaviorContradictions = derivePolicyBehaviorContradictions({
    policyEnrichments: scanRecord.policyEnrichment,
    preconsentViolations: preconsentViolationRows,
    runtimeArtifacts,
    snapshot,
    trackerVendors: scanRecord.trackerVendors
  });
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
  const accessibilityIssueRows = snapshot ? deriveAccessibilityIssueRows(snapshot) : [];
  const accessibilityIssueChangeRows = deriveAccessibilityIssueChangeRows({
    currentSnapshot: snapshot,
    previousSnapshot: scanRecord.previousSnapshot
  });
  const accessibilityRuleEvidenceRows = deriveAccessibilityRuleEvidenceRows({
    examples: scanRecord.accessibilityRuleExamples ?? [],
    ruleCounts: scanRecord.accessibilityRuleCounts ?? []
  });
  const prioritizedAccessibilityRuleRows = [...accessibilityRuleEvidenceRows]
    .sort((left, right) => right.weightedPriority - left.weightedPriority)
    .slice(0, 6);
  const accessibilityDisclosureCount = [
    snapshot?.accessibility_statement_present === true,
    snapshot?.vpat_or_accessibility_conformance_doc_present === true,
    snapshot?.accessibility_contact_method_present === true
  ].filter(Boolean).length;
  const preconsentNewCount = scanRecord.preconsentChanges.filter((change) => change.changeType === "new").length;
  const preconsentResolvedCount = scanRecord.preconsentChanges.filter((change) => change.changeType === "resolved").length;
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
  const taxonomySnapshotSections = snapshot
    ? groupSnapshotFieldsByPrimaryCategory(Object.keys(snapshot)).map((group) => ({
        title: group.category.label,
        description: group.category.description,
        fields: group.entries.map((entry) => entry.key)
      }))
    : [];

  return (
    <div className="min-w-0 overflow-x-hidden space-y-8">
      <div className="space-y-3">
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
      </div>

      {isInProgress ? (
        <FullScanProgressCard
          createdAt={scanRecord.scan.createdAt}
          events={scanRecord.events.map((event) => ({
            createdAt: event.createdAt,
            eventType: event.eventType,
            message: event.message,
            metadataJson: event.metadataJson
          }))}
          status={scanRecord.scan.status}
        />
      ) : null}

      {snapshot ? (
        <div className="grid gap-4">
          <div className="rounded-2xl border border-slate-200 bg-white px-6 py-5">
            <div className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center gap-1.5">
                  <p className="text-base font-semibold text-slate-900">Executive summary</p>
                  <InfoTip
                    align="start"
                    text="These ratings mirror the five primary evidence sections and use a 0.0 to 5.0 higher-is-better scale."
                  />
                </div>
              </div>

              <div className={METRIC_GRID_CLASS}>
                <div className={METRIC_CARD_CLASS}>
                  <div className="flex items-center gap-1.5">
                    <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500">Privacy & disclosure</p>
                    <InfoTip align="start" text="Combined 1 to 5 section rating for privacy-policy quality, policy-page coverage, and consumer-facing disclosure posture." />
                  </div>
                  <p className={METRIC_CARD_VALUE_CLASS}>{formatRating(privacyLegalSectionScore)}</p>
                </div>
                <div className={METRIC_CARD_CLASS}>
                  <div className="flex items-center gap-1.5">
                    <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500">Consent</p>
                    <InfoTip align="start" text="Combined 1 to 5 section rating for banner visibility, choice quality, CMP posture, and consent-flow behavior." />
                  </div>
                  <p className={METRIC_CARD_VALUE_CLASS}>{formatRating(cookieConsentSectionScore)}</p>
                </div>
                <div className={METRIC_CARD_CLASS}>
                  <div className="flex items-center gap-1.5">
                    <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500">Trackers</p>
                    <InfoTip align="start" text="Combined 1 to 5 section rating for tracker risk, third-party collection surface, and the observed vendor ecosystem." />
                  </div>
                  <p className={METRIC_CARD_VALUE_CLASS}>{formatRating(trackerSectionScore)}</p>
                </div>
                <div className={METRIC_CARD_CLASS}>
                  <div className="flex items-center gap-1.5">
                    <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500">Pre-consent</p>
                    <InfoTip align="start" text="Combined 1 to 5 section rating for whether trackers fired before consent and whether the consent audit showed enforcement failures." />
                  </div>
                  <p className={METRIC_CARD_VALUE_CLASS}>{formatRating(preconsentSectionScore)}</p>
                </div>
                <div className={METRIC_CARD_CLASS}>
                  <div className="flex items-center gap-1.5">
                    <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500">Accessibility & consumer</p>
                    <InfoTip align="start" text="Combined 1 to 5 section rating for accessibility posture, WCAG-oriented findings, and broader consumer-facing signals." />
                  </div>
                  <p className={METRIC_CARD_VALUE_CLASS}>{formatRating(accessibilityConsumerSectionScore)}</p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {policyBehaviorContradictions.length > 0 ? (
                  <div className="flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-xs font-medium uppercase tracking-[0.16em] text-amber-800">
                    <span>{policyBehaviorContradictions.length} contradiction{policyBehaviorContradictions.length === 1 ? "" : "s"}</span>
                    <InfoTip align="start" text="Number of policy-versus-behavior contradictions surfaced from comparing public claims with observed runtime behavior." />
                  </div>
                ) : null}
                {(consentPreconsentViolationCount ?? 0) > 0 ? (
                  <div className="flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-xs font-medium uppercase tracking-[0.16em] text-amber-800">
                    <span>{consentPreconsentViolationCount} pre-consent conflict{consentPreconsentViolationCount === 1 ? "" : "s"}</span>
                    <InfoTip align="start" text="Number of tracker vendors with persisted evidence showing they fired before a consent interaction was completed." />
                  </div>
                ) : null}
                {consentAuditCompleted ? (
                  <div className="flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium uppercase tracking-[0.16em] text-slate-700">
                    <span>reject {consentRejectReducedTracking === false ? "failed" : consentRejectReducedTracking === true ? "reduced tracking" : "audit completed"}</span>
                    <InfoTip align="start" text="Outcome of the consent interaction audit after attempting a reject path. This shows whether tracking activity actually changed after the choice." />
                  </div>
                ) : null}
                {snapshot.cmp_vendor_name ? (
                  <div className="flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium uppercase tracking-[0.16em] text-slate-700">
                    <span>CMP {String(snapshot.cmp_vendor_name)}</span>
                    <InfoTip align="end" text="Consent-management platform vendor detected on the site, based on observed CMP signatures or consent-surface behavior." />
                  </div>
                ) : null}
              </div>

            </div>
          </div>
        </div>
      ) : null}

      {snapshot ? (
        <div className="space-y-4">
          <div className="space-y-4">
            <TopLevelEvidenceSection
              title={
                <span className="flex items-center gap-1.5">
                  <span>Privacy Policy & Disclosure</span>
                  <InfoTip text="Core policy-page coverage, consumer policy posture, policy enrichment, and claim-versus-behavior contradictions are grouped here so users can evaluate what the site says before looking at runtime behavior." />
                </span>
              }
            >
              <ResultCategorySection
                title="Policy and disclosure posture"
                staticSection
                collapseDetails
                detailsTitle="Disclosure detail signals"
                collapsible={false}
                metrics={[
                  {
                    label: "Policy coverage",
                    value: formatRating(snapshot.legal_coverage_score),
                    tooltip:
                      "A 5-point higher-is-better summary of public-facing policy and disclosure coverage, including whether key policy or transparency pages are present."
                  },
                  {
                    label: "Consumer posture",
                    value: formatRating(snapshot.consumer_protection_score),
                    tooltip:
                      "A 5-point higher-is-better summary of consumer-facing transparency posture, including disclosures, cancellation or refund clarity, and policy-to-behavior consistency signals."
                  },
                  {
                    label: "Privacy policy",
                    value: formatCompactValue(snapshot.privacy_policy_present),
                    tooltip:
                      "Whether the scan detected a public privacy policy page or a strong privacy-policy signal."
                  },
                  {
                    label: "Terms",
                    value: formatCompactValue(snapshot.terms_of_service_present),
                    tooltip:
                      "Whether the scan detected a public terms of service, terms and conditions, or comparable terms page."
                  }
                ]}
                details={[
                  { label: "Cookie policy", value: snapshot.cookie_policy_present },
                  { label: "Accessibility statement", value: snapshot.accessibility_statement_present },
                  { label: "Contact page", value: snapshot.contact_page_present },
                  { label: "Subscription terms", value: snapshot.subscription_terms_present },
                  { label: "Auto-renew disclosure", value: snapshot.auto_renew_disclosure_present ?? snapshot.auto_renewal_disclosure_present },
                  { label: "Cancellation policy", value: snapshot.subscription_cancellation_policy_present ?? snapshot.cancellation_policy_present },
                  { label: "Free trial", value: snapshot.free_trial_detected },
                  { label: "Refund policy", value: snapshot.refund_policy_present },
                  { label: "Countdown timer", value: snapshot.dark_pattern_countdown_timer_present },
                  { label: "Fake scarcity language", value: snapshot.dark_pattern_fake_scarcity_language },
                  { label: "Policy enrichment pages", value: scanRecord.policyEnrichment.length },
                  { label: "Policy review items", value: scanRecord.policyReviewQueue.length }
                ]}
              />

              {policyBehaviorContradictions.length > 0 ? (
                <StaticSubsection
                  title="Contradictions and claim checks"
                  tooltip="These contradiction cards compare public policy or consent claims against observed runtime behavior. They are intentionally shown here as a synthesis layer inside the privacy and disclosure section, rather than as a separate top-level report area."
                >
                  <div className={METRIC_GRID_CLASS}>
                    <div className={EMPHASIS_METRIC_CARD_CLASS}>
                      <p className="text-[10px] uppercase tracking-[0.14em] text-amber-800">Contradictions surfaced</p>
                      <p className={EMPHASIS_METRIC_CARD_VALUE_CLASS}>{policyBehaviorContradictions.length}</p>
                    </div>
                    <div
                      className={
                        snapshot.policy_behavior_conflict_detected ?? snapshot.policyBehaviorConflictDetected
                          ? EMPHASIS_METRIC_CARD_CLASS
                          : METRIC_CARD_CLASS
                      }
                    >
                      <p
                        className={
                          snapshot.policy_behavior_conflict_detected ?? snapshot.policyBehaviorConflictDetected
                            ? "text-[10px] uppercase tracking-[0.14em] text-amber-800"
                            : "text-[10px] uppercase tracking-[0.14em] text-slate-500"
                        }
                      >
                        Policy conflict signal
                      </p>
                      <p
                        className={
                          snapshot.policy_behavior_conflict_detected ?? snapshot.policyBehaviorConflictDetected
                            ? EMPHASIS_METRIC_CARD_VALUE_CLASS
                            : METRIC_CARD_VALUE_CLASS
                        }
                      >
                        {formatCompactValue(snapshot.policy_behavior_conflict_detected ?? snapshot.policyBehaviorConflictDetected)}
                      </p>
                    </div>
                    <div className={preconsentViolationRows.length > 0 ? EMPHASIS_METRIC_CARD_CLASS : METRIC_CARD_CLASS}>
                      <p
                        className={
                          preconsentViolationRows.length > 0
                            ? "text-[10px] uppercase tracking-[0.14em] text-amber-800"
                            : "text-[10px] uppercase tracking-[0.14em] text-slate-500"
                        }
                      >
                        Pre-consent conflicts
                      </p>
                      <p className={preconsentViolationRows.length > 0 ? EMPHASIS_METRIC_CARD_VALUE_CLASS : METRIC_CARD_VALUE_CLASS}>
                        {preconsentViolationRows.length}
                      </p>
                    </div>
                    <div className={METRIC_CARD_CLASS}>
                      <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500">Advertising vendors</p>
                      <p className={METRIC_CARD_VALUE_CLASS}>
                        {scanRecord.trackerVendors.filter((tracker) => tracker.vendorCategory === "advertising").length}
                      </p>
                    </div>
                  </div>
                  <CollapsibleSectionCard title="Contradiction records" defaultOpen={false} contentClassName="space-y-4">
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                      {policyBehaviorContradictions.map((row) => (
                        <div
                          key={`${row.title}-${row.status}-${row.observedBehavior}`}
                          className="rounded-2xl border border-slate-200 bg-white px-4 py-4"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-semibold text-slate-950">{row.title}</p>
                              <p className="mt-1 text-xs uppercase tracking-[0.16em] text-slate-500">{row.status}</p>
                            </div>
                            <span
                              className={
                                row.severity === "high"
                                  ? "rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.16em] text-rose-700"
                                  : "rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.16em] text-amber-700"
                              }
                            >
                              {row.severity}
                            </span>
                          </div>
                          <p className="mt-3 text-sm text-slate-700">
                            <span className="font-medium text-slate-900">Policy claim:</span> {row.claim}
                          </p>
                          <p className="mt-2 text-sm text-slate-700">
                            <span className="font-medium text-slate-900">Observed behavior:</span> {row.observedBehavior}
                          </p>
                          {row.evidence.length > 0 ? (
                            <div className="mt-3 space-y-1">
                              <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Evidence</p>
                              {row.evidence.map((evidence) =>
                                evidence.startsWith("http://") || evidence.startsWith("https://") ? (
                                  <a
                                    key={`${row.title}-${evidence}`}
                                    className="block break-all text-xs text-slate-700 underline underline-offset-2"
                                    href={evidence}
                                    rel="noreferrer"
                                    target="_blank"
                                  >
                                    {evidence}
                                  </a>
                                ) : (
                                  <p key={`${row.title}-${evidence}`} className="text-xs text-slate-700">
                                    {evidence}
                                  </p>
                                )
                              )}
                            </div>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </CollapsibleSectionCard>
                </StaticSubsection>
              ) : null}

              <PolicyEnrichmentSection
                enrichments={scanRecord.policyEnrichment}
                reviewQueue={scanRecord.policyReviewQueue}
                embedded
              />
            </TopLevelEvidenceSection>

            <TopLevelEvidenceSection
              title={
                <span className="flex items-center gap-1.5">
                  <span>Cookie Banner & Consent</span>
                  <InfoTip text="Visible consent controls, CMP posture, dark-pattern indicators, and post-choice enforcement behavior are grouped here so the consent system can be evaluated end to end." />
                </span>
              }
            >
              <ResultCategorySection
                title="Consent posture summary"
                staticSection
                collapseDetails
                detailsTitle="Consent detail signals"
                collapsible={false}
                metrics={[
                  {
                    label: "Privacy rating",
                    value: formatRating(snapshot.privacy_score),
                    tooltip:
                      "A 5-point higher-is-better summary of observable privacy posture, including public rights paths, privacy disclosures, and data-handling signals surfaced in this scan."
                  },
                  {
                    label: "Consent rating",
                    value: formatRating(snapshot.consent_score),
                    tooltip:
                      "A 5-point higher-is-better summary of consent posture, including visible consent controls, reject-all availability, granular choices, and consent-related behavior."
                  },
                  {
                    label: "Cookie banner",
                    value: formatCompactValue(snapshot.cookie_banner_present),
                    tooltip:
                      "Whether the scan observed a visible cookie or consent banner on the site during this run."
                  },
                  {
                    label: "Pre-consent tracking",
                    value: formatCompactValue(preConsentTrackingObserved),
                    tooltip:
                      "Whether tracking-related behavior or third-party cookie activity was observed before a clear consent interaction point was completed."
                  }
                ]}
                details={[
                  { label: "Consent mechanism", value: snapshot.consent_mechanism_type },
                  { label: "CMP vendor", value: snapshot.cmp_vendor_name },
                  { label: "Reject-all control", value: snapshot.reject_all_present },
                  { label: "Granular preferences", value: snapshot.granular_preferences_present },
                  { label: "Reject button missing", value: snapshot.dark_pattern_reject_button_missing },
                  { label: "Accept more prominent", value: snapshot.dark_pattern_accept_button_prominence },
                  { label: "Forced consent wall", value: snapshot.dark_pattern_forced_consent_wall },
                  { label: "Dismiss without reject", value: snapshot.dark_pattern_dismiss_without_reject },
                  { label: "DSAR mechanism", value: snapshot.dsar_request_mechanism_present },
                  { label: "Privacy request form", value: snapshot.privacy_request_form_present },
                  { label: "Access request path", value: snapshot.data_access_request_present },
                  { label: "Deletion request path", value: snapshot.data_deletion_request_present },
                  { label: "Privacy contact channel", value: snapshot.privacy_contact_channel_type },
                  { label: "Cookie count", value: snapshot.cookie_count_total },
                  { label: "Third-party cookies", value: snapshot.third_party_cookie_count }
                ]}
              />

              {consentAuditCompleted ? (
                <StaticSubsection
                  title="Post-choice audit"
                  tooltip="Interaction audit evidence comparing the site before consent and after a reject interaction. This helps distinguish visible banners from actual consent enforcement."
                >
                  <div className={METRIC_GRID_CLASS}>
                    <div className={METRIC_CARD_CLASS}>
                      <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500">Reject interaction</p>
                      <p className={METRIC_CARD_VALUE_CLASS}>
                        {formatCompactValue(consentRejectInteractionSucceeded)}
                      </p>
                    </div>
                    <div className={METRIC_CARD_CLASS}>
                      <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500">Pre-consent conflicts</p>
                      <p className={METRIC_CARD_VALUE_CLASS}>
                        {formatCompactValue(consentPreconsentViolationCount)}
                      </p>
                    </div>
                    <div className={METRIC_CARD_CLASS}>
                      <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500">Tracking reduced after reject</p>
                      <p className={METRIC_CARD_VALUE_CLASS}>
                        {formatCompactValue(consentRejectReducedTracking)}
                      </p>
                    </div>
                    <div className={METRIC_CARD_CLASS}>
                      <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500">3P cookies reduced</p>
                      <p className={METRIC_CARD_VALUE_CLASS}>
                        {formatCompactValue(consentRejectReducedThirdPartyCookies)}
                      </p>
                    </div>
                    <div className={METRIC_CARD_CLASS}>
                      <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500">Accept interaction</p>
                      <p className={METRIC_CARD_VALUE_CLASS}>
                        {formatCompactValue(consentAcceptInteractionSucceeded)}
                      </p>
                    </div>
                  </div>
                  <CollapsibleSectionCard title="Audit detail signals" defaultOpen={false}>
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                        <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Cookie counts</p>
                        <p className="mt-1 text-sm text-slate-700">
                          Baseline {formatCompactValue(consentBaselineCookieCount)} · Post-reject{" "}
                          {formatCompactValue(consentPostRejectCookieCount)}
                        </p>
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                        <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Reject clicks</p>
                        <p className="mt-1 text-sm text-slate-700">
                          {formatCompactValue(runtimeArtifacts?.consent_reject_click_count)}
                        </p>
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                        <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Baseline tracker vendors</p>
                        <p className="mt-1 text-sm text-slate-700">{formatCompactValue(consentBaselineTrackerVendors)}</p>
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                        <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Baseline evidence URLs</p>
                        <p className="mt-1 text-sm text-slate-700">{formatCompactValue(consentBaselineTrackerEvidenceUrls)}</p>
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                        <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Post-reject tracker vendors</p>
                        <p className="mt-1 text-sm text-slate-700">{formatCompactValue(consentPostRejectTrackerVendors)}</p>
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                        <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Post-reject evidence URLs</p>
                        <p className="mt-1 text-sm text-slate-700">{formatCompactValue(consentPostRejectTrackerEvidenceUrls)}</p>
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                        <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Persisted after reject</p>
                        <p className="mt-1 text-sm text-slate-700">
                          {formatCompactValue(consentRejectPersistedTrackerVendors)}
                        </p>
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                        <p className="text-xs uppercase tracking-[0.16em] text-slate-500">New after reject</p>
                        <p className="mt-1 text-sm text-slate-700">{formatCompactValue(consentRejectNewTrackerVendors)}</p>
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                        <p className="text-xs uppercase tracking-[0.16em] text-slate-500">New after accept</p>
                        <p className="mt-1 text-sm text-slate-700">{formatCompactValue(consentAcceptNewTrackerVendors)}</p>
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                        <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Post-accept evidence URLs</p>
                        <p className="mt-1 text-sm text-slate-700">{formatCompactValue(consentPostAcceptTrackerEvidenceUrls)}</p>
                      </div>
                    </div>
                  </CollapsibleSectionCard>
                </StaticSubsection>
              ) : null}
            </TopLevelEvidenceSection>

            <TopLevelEvidenceSection
              title={
                <span className="flex items-center gap-1.5">
                  <span>Tracker & Third-Party Data Collection Detection</span>
                  <InfoTip text="This section covers the observed tracker ecosystem, third-party collection surface, inventory changes, and the concrete vendors behind the site’s analytics, advertising, replay, and customer-data routing stack." />
                </span>
              }
            >
              <ResultCategorySection
                title="Tracker posture summary"
                staticSection
                collapseDetails
                detailsTitle="Tracker detail signals"
                collapsible={false}
                metrics={[
                  {
                    label: "Tracker count",
                    value: formatCompactValue(snapshot.tracker_count_total),
                    tooltip:
                      "The total number of tracker detections surfaced in the scan across the observed pages and runtime evidence."
                  },
                  {
                    label: "3P script domains",
                    value: formatCompactValue(snapshot.third_party_script_domain_count),
                    tooltip:
                      "The number of distinct third-party script source domains observed, which helps indicate how broad the site's external script ecosystem is."
                  },
                  {
                    label: "Forms",
                    value: formatCompactValue(snapshot.form_count_total),
                    tooltip:
                      "The number of detected forms observed in the scan, used as a simple indicator of user-input and data-collection surface area."
                  },
                  {
                    label: "Sensitive collection",
                    value: formatCompactValue(snapshot.high_sensitivity_data_collection_detected),
                    tooltip:
                      "Whether the scan detected signals suggesting collection of higher-sensitivity user data through public-facing forms or flows."
                  }
                ]}
                details={[
                  { label: "Session replay trackers", value: snapshot.session_replay_tracker_count },
                  { label: "Session replay tool", value: snapshot.session_replay_tool_detected },
                  { label: "Google Ads", value: snapshot.ad_network_google_ads },
                  { label: "Meta Ads", value: snapshot.ad_network_meta_ads },
                  { label: "Retargeting pixel", value: snapshot.retargeting_pixel_detected },
                  { label: "Checkout or payment flow", value: snapshot.checkout_or_payment_form_present },
                  { label: "Chat support vendor", value: snapshot.chat_support_vendor },
                  { label: "Payment processors", value: snapshot.payment_processor_hints },
                  { label: "Tracker concentration", value: snapshot.tracker_vendor_concentration_score },
                  { label: "Tracker diversity", value: snapshot.tracker_diversity_score },
                  { label: "3P request count", value: runtimeArtifacts?.third_party_request_count },
                  { label: "3P request domains", value: runtimeArtifacts?.third_party_request_domains },
                  { label: "Initial cookies", value: runtimeArtifacts?.initial_cookie_count },
                  { label: "Initial cookie names", value: runtimeArtifacts?.initial_cookie_names },
                  { label: "Script tag count", value: runtimeArtifacts?.script_tag_count },
                  { label: "Script source domains", value: runtimeArtifacts?.script_src_domains }
                ]}
              />

              {scanRecord.trackerChanges.length > 0 ? (
                <SectionSubsection
                  title="Tracker changes versus previous scan"
                  intro="This subsection highlights vendor additions and removals so changes in the third-party stack stand out immediately."
                  tooltip="Tracker vendors added or removed compared with the prior completed scan for this domain."
                >
                  <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
                    <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-2.5">
                      <p className="text-[10px] uppercase tracking-[0.14em] text-emerald-700">Added vendors</p>
                      <p className="mt-1 text-sm font-semibold text-emerald-950">
                        {scanRecord.trackerChanges.filter((change) => change.changeType === "added").length}
                      </p>
                    </div>
                    <div className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2.5">
                      <p className="text-[10px] uppercase tracking-[0.14em] text-amber-700">Removed vendors</p>
                      <p className="mt-1 text-sm font-semibold text-amber-950">
                        {scanRecord.trackerChanges.filter((change) => change.changeType === "removed").length}
                      </p>
                    </div>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {scanRecord.trackerChanges.map((change) => (
                      <div
                        key={`${change.changeType}-${change.vendorName}`}
                        className="rounded-2xl border border-slate-200 bg-white px-4 py-3"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-medium text-slate-950">{change.vendorName}</p>
                          <span
                            className={
                              change.changeType === "added"
                                ? "rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.16em] text-emerald-800"
                                : "rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.16em] text-amber-800"
                            }
                          >
                            {change.changeType}
                          </span>
                        </div>
                        <p className="mt-1 text-xs uppercase tracking-[0.16em] text-slate-500">{change.vendorCategory}</p>
                        <p className="mt-2 text-sm text-slate-700">Confidence {formatConfidence(change.confidence)}</p>
                      </div>
                    ))}
                  </div>
                </SectionSubsection>
              ) : null}

              {scanRecord.trackerVendors.length > 0 ? (
                <StaticSubsection
                  title="Tracker inventory"
                  tooltip="Observed tracker and third-party data-collection vendors for this scan, including category, request source, party classification, and consent timing when known."
                >
                  <div className={METRIC_GRID_CLASS}>
                    <div className={METRIC_CARD_CLASS}>
                      <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500">Tracker vendors</p>
                      <p className={METRIC_CARD_VALUE_CLASS}>{scanRecord.trackerVendors.length}</p>
                    </div>
                    <div className={METRIC_CARD_CLASS}>
                      <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500">Advertising vendors</p>
                      <p className={METRIC_CARD_VALUE_CLASS}>
                        {scanRecord.trackerVendors.filter((tracker) => tracker.vendorCategory === "advertising").length}
                      </p>
                    </div>
                    <div className={METRIC_CARD_CLASS}>
                      <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500">Session replay vendors</p>
                      <p className={METRIC_CARD_VALUE_CLASS}>
                        {scanRecord.trackerVendors.filter((tracker) => tracker.vendorCategory === "session_replay").length}
                      </p>
                    </div>
                    <div className={METRIC_CARD_CLASS}>
                      <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500">Distinct categories</p>
                      <p className={METRIC_CARD_VALUE_CLASS}>
                        {new Set(scanRecord.trackerVendors.map((tracker) => tracker.vendorCategory)).size}
                      </p>
                    </div>
                  </div>
                  <CollapsibleSectionCard title="Tracker vendor records" defaultOpen={false}>
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                      {scanRecord.trackerVendors.map((tracker) => (
                        <div
                          key={`${tracker.vendorName}-${tracker.scriptHost ?? "none"}-${tracker.detectionSource}`}
                          className="rounded-2xl border border-slate-200 bg-white px-4 py-3"
                        >
                          <p className="text-sm font-medium text-slate-950">{tracker.vendorName}</p>
                          <p className="mt-1 text-xs uppercase tracking-[0.16em] text-slate-500">
                            {tracker.vendorCategory} · {tracker.detectionSource} · {tracker.firstPartyOrThirdParty}
                          </p>
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {getTrackerRiskLabels(tracker).map((label) => (
                              <span
                                key={`${tracker.vendorName}-${label}`}
                                className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.16em] text-slate-700"
                              >
                                {formatTrackerRiskLabel(label)}
                              </span>
                            ))}
                          </div>
                          <p className="mt-2 text-sm text-slate-700">
                            Before consent {formatCompactValue(tracker.beforeConsent)} · Confidence {formatConfidence(tracker.confidence)}
                          </p>
                          <p className="mt-1 text-sm text-slate-600">
                            Host {tracker.scriptHost ?? "n/a"} · Signature {tracker.matchedSignatureId ?? "n/a"}
                          </p>
                          <p className="mt-1 text-sm text-slate-600">
                            Endpoint {formatCollectionEndpointType(tracker.collectionEndpointType)}
                          </p>
                        </div>
                      ))}
                    </div>
                  </CollapsibleSectionCard>
                </StaticSubsection>
              ) : null}
            </TopLevelEvidenceSection>

            <TopLevelEvidenceSection
              title={
                <span className="flex items-center gap-1.5">
                  <span>Pre-Consent Tracking Detection</span>
                  <InfoTip text="This section covers vendors and evidence observed before a consent interaction was completed, plus changes from the prior scan and the supporting request evidence." />
                </span>
              }
            >
              {preconsentViolationRows.length > 0 ? (
                <>
                  <StaticSubsection
                    title="Violation overview"
                  >
                    <div className={METRIC_GRID_CLASS}>
                      <div className={EMPHASIS_METRIC_CARD_CLASS}>
                        <p className="text-[10px] uppercase tracking-[0.14em] text-amber-800">Tracked vendors</p>
                        <p className={EMPHASIS_METRIC_CARD_VALUE_CLASS}>{preconsentViolationRows.length}</p>
                      </div>
                      <div className={EMPHASIS_METRIC_CARD_CLASS}>
                        <p className="text-[10px] uppercase tracking-[0.14em] text-amber-800">Evidence URLs</p>
                        <p className={EMPHASIS_METRIC_CARD_VALUE_CLASS}>{consentBaselineTrackerEvidenceUrls.length}</p>
                      </div>
                    </div>
                    <CollapsibleSectionCard title="Violation detail signals" defaultOpen={false}>
                      <div className={METRIC_GRID_CLASS}>
                        <div className={METRIC_CARD_CLASS}>
                          <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500">Advertising / adtech</p>
                          <p className={METRIC_CARD_VALUE_CLASS}>
                            {preconsentViolationRows.filter((row) => row.vendorCategory === "advertising").length}
                          </p>
                        </div>
                        <div className={METRIC_CARD_CLASS}>
                          <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500">Session replay</p>
                          <p className={METRIC_CARD_VALUE_CLASS}>
                            {preconsentViolationRows.filter((row) => row.vendorCategory === "session_replay").length}
                          </p>
                        </div>
                      </div>
                    </CollapsibleSectionCard>
                  </StaticSubsection>

                  {scanRecord.preconsentChanges.length > 0 ? (
                    <SectionSubsection
                      title="Change tracking"
                      intro="This compares the current pre-consent trackers with the previous completed scan for the same domain."
                    >
                      <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
                        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-2.5">
                          <p className="text-[10px] uppercase tracking-[0.14em] text-emerald-700">New since previous scan</p>
                          <p className="mt-1 text-sm font-semibold text-emerald-950">{preconsentNewCount}</p>
                        </div>
                        <div className="rounded-lg border border-sky-200 bg-sky-50 px-2.5 py-2.5">
                          <p className="text-[10px] uppercase tracking-[0.14em] text-sky-700">Resolved since previous scan</p>
                          <p className="mt-1 text-sm font-semibold text-sky-950">{preconsentResolvedCount}</p>
                        </div>
                      </div>
                      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                        {scanRecord.preconsentChanges.map((change) => (
                          <div key={`preconsent-change-${change.changeType}-${change.vendorName}`} className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                            <div className="flex items-center justify-between gap-3">
                              <p className="text-sm font-medium text-slate-950">{change.vendorName}</p>
                              <span
                                className={
                                  change.changeType === "new"
                                    ? "rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.16em] text-emerald-800"
                                    : "rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.16em] text-sky-800"
                                }
                              >
                                {change.changeType}
                              </span>
                            </div>
                            <p className="mt-1 text-xs uppercase tracking-[0.16em] text-slate-500">{change.vendorCategory}</p>
                            <p className="mt-2 text-sm text-slate-700">Confidence {formatConfidence(change.confidence)}</p>
                          </div>
                        ))}
                      </div>
                    </SectionSubsection>
                  ) : null}

                  <StaticSubsection
                    title="Vendor evidence"
                  >
                    <CollapsibleSectionCard title="Vendor records" defaultOpen={false}>
                      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                        {preconsentViolationRows.map((row) => (
                          <div
                            key={`preconsent-${row.vendorName}`}
                            className="rounded-2xl border border-slate-200 bg-white px-4 py-4"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="text-sm font-semibold text-slate-950">{row.vendorName}</p>
                                <p className="mt-1 text-xs uppercase tracking-[0.16em] text-slate-500">
                                  {row.vendorCategory} · {row.detectionSource}
                                </p>
                              </div>
                              <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.16em] text-rose-700">
                                pre-consent
                              </span>
                            </div>
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {getTrackerRiskLabels({
                                vendorCategory: row.vendorCategory,
                                vendorName: row.vendorName,
                                collectionEndpointType: row.collectionEndpointType
                              }).map((label) => (
                                <span
                                  key={`${row.vendorName}-${label}-preconsent`}
                                  className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.16em] text-slate-700"
                                >
                                  {formatTrackerRiskLabel(label)}
                                </span>
                              ))}
                              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.16em] text-slate-700">
                                {formatTrackerSeverityLabel(
                                  getTrackerSeverity({
                                    vendorCategory: row.vendorCategory,
                                    vendorName: row.vendorName,
                                    collectionEndpointType: row.collectionEndpointType
                                  }).label
                                )}
                              </span>
                            </div>
                            <p className="mt-2 text-sm text-slate-700">Endpoint {formatCollectionEndpointType(row.collectionEndpointType)}</p>
                            <p className="mt-1 text-sm text-slate-600">Host {row.scriptHost ?? "n/a"}</p>
                            <div className="mt-3 space-y-1">
                              <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Evidence URLs</p>
                              {row.evidenceUrls.length > 0 ? (
                                row.evidenceUrls.map((url) => (
                                  <a
                                    key={`${row.vendorName}-${url}`}
                                    className="block break-all text-xs text-slate-700 underline underline-offset-2"
                                    href={url}
                                    rel="noreferrer"
                                    target="_blank"
                                  >
                                    {url}
                                  </a>
                                ))
                              ) : (
                                <p className="text-xs text-slate-500">No vendor-specific URL sample matched; runtime audit still observed this vendor pre-consent.</p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </CollapsibleSectionCard>
                  </StaticSubsection>
                </>
              ) : (
                <StaticSubsection
                  title="Violation overview"
                >
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm text-emerald-900">
                    No pre-consent tracker violations were persisted for this scan.
                  </div>
                </StaticSubsection>
              )}
            </TopLevelEvidenceSection>

            <TopLevelEvidenceSection
              title={
                <span className="flex items-center gap-1.5">
                  <span>Accessibility & Consumer Protection Signals</span>
                  <InfoTip text="This section combines public-facing accessibility posture with the most consumer-protection-relevant collection and friction signals, so accessibility and disclosure risk can be reviewed in one place." />
                </span>
              }
            >
              <StaticSubsection
                title="Accessibility & disclosure posture"
                tooltip="A more analyst-friendly accessibility view combining automated WCAG-oriented issue families with public-facing accessibility disclosures such as statements, VPAT references, and support channels."
              >
                <div className={METRIC_GRID_CLASS}>
                  <div className={METRIC_CARD_CLASS}>
                    <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500">WCAG issue volume</p>
                    <p className={METRIC_CARD_VALUE_CLASS}>{formatCompactValue(snapshot.wcag_error_count_total)}</p>
                  </div>
                  <div className={METRIC_CARD_CLASS}>
                    <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500">Disclosure coverage</p>
                    <p className={METRIC_CARD_VALUE_CLASS}>{accessibilityDisclosureCount}/3</p>
                  </div>
                  <div className={METRIC_CARD_CLASS}>
                    <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500">Claim mismatch</p>
                    <p className={METRIC_CARD_VALUE_CLASS}>
                      {formatCompactValue(snapshot.accessibility_claim_mismatch_detected)}
                    </p>
                  </div>
                  <div className={METRIC_CARD_CLASS}>
                    <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500">Accessibility risk score</p>
                    <p className={METRIC_CARD_VALUE_CLASS}>
                      {formatCompactValue(snapshot.accessibility_litigation_risk_score)}
                    </p>
                  </div>
                </div>

                <div className={METRIC_GRID_CLASS}>
                  {accessibilityIssueRows.length > 0 ? (
                    accessibilityIssueRows.map((row) => {
                      const severity = getAccessibilitySeverity(row.count);
                      return (
                        <div key={row.key} className={METRIC_CARD_CLASS}>
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-sm font-semibold text-slate-950">{row.label}</p>
                            <span
                              className={
                                severity === "high"
                                  ? "rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.16em] text-rose-700"
                                  : severity === "medium"
                                    ? "rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.16em] text-amber-700"
                                    : "rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.16em] text-slate-700"
                              }
                            >
                              {severity}
                            </span>
                          </div>
                          <p className={METRIC_CARD_VALUE_CLASS}>{row.count}</p>
                          <p className="mt-2 text-sm text-slate-600">{row.description}</p>
                        </div>
                      );
                    })
                  ) : (
                    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm text-emerald-900">
                      No major automated WCAG issue families were surfaced in this scan.
                    </div>
                  )}
                </div>

                <div className={METRIC_GRID_CLASS}>
                  <div className={METRIC_CARD_CLASS}>
                    <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500">Accessibility statement</p>
                    <p className={METRIC_CARD_VALUE_CLASS}>{formatCompactValue(snapshot.accessibility_statement_present)}</p>
                  </div>
                  <div className={METRIC_CARD_CLASS}>
                    <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500">VPAT / conformance reference</p>
                    <p className={METRIC_CARD_VALUE_CLASS}>{formatCompactValue(snapshot.vpat_or_accessibility_conformance_doc_present)}</p>
                  </div>
                  <div className={METRIC_CARD_CLASS}>
                    <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500">Support contact</p>
                    <p className={METRIC_CARD_VALUE_CLASS}>{formatCompactValue(snapshot.accessibility_contact_method_present)}</p>
                  </div>
                </div>

                <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-4 text-sm text-sky-950">
                  This section is aligned to public-facing WCAG-oriented issue patterns and accessibility disclosure posture. It is useful for triage and accessibility risk screening, not as a formal WCAG conformance certification.
                </div>
                <CollapsibleSectionCard title="Accessibility evidence details" defaultOpen={false} contentClassName="space-y-4">
                  {accessibilityIssueChangeRows.length > 0 ? (
                    <div className="space-y-3">
                      <p className="text-sm font-medium text-slate-800">Changes versus previous completed scan</p>
                      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                        {accessibilityIssueChangeRows.map((row) => (
                          <div key={`a11y-change-${row.key}`} className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                            <div className="flex items-center justify-between gap-3">
                              <p className="text-sm font-medium text-slate-950">{row.label}</p>
                              <span
                                className={
                                  row.delta > 0
                                    ? "rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.16em] text-rose-700"
                                    : "rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.16em] text-emerald-700"
                                }
                              >
                                {row.delta > 0 ? `+${row.delta}` : row.delta}
                              </span>
                            </div>
                            <p className="mt-2 text-sm text-slate-600">
                              Previous {row.previous} · Current {row.current}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {prioritizedAccessibilityRuleRows.length > 0 ? (
                    <div className="space-y-3">
                      <div className="flex items-center gap-1.5">
                        <p className="text-sm font-medium text-slate-800">Representative WCAG evidence and remediation priority</p>
                        <InfoTip text="These rows come from persisted accessibility rule counts for the scan's automated browser audit. They map the top rules into likely WCAG criteria, explain user impact, and suggest a remediation-first order." />
                      </div>
                      <div className="grid gap-3 md:grid-cols-2">
                        {prioritizedAccessibilityRuleRows.map((row) => (
                          <div
                            key={`accessibility-evidence-${row.ruleCode}`}
                            className="rounded-2xl border border-slate-200 bg-white px-4 py-4"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="text-sm font-semibold text-slate-950">{row.family}</p>
                                <p className="mt-1 text-xs uppercase tracking-[0.16em] text-slate-500">
                                  {row.ruleCode} · {row.ruleGroup}
                                </p>
                              </div>
                              <span
                                className={
                                  row.severity === "high"
                                    ? "rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.16em] text-rose-700"
                                    : row.severity === "medium"
                                      ? "rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.16em] text-amber-700"
                                      : "rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.16em] text-sky-700"
                                }
                              >
                                {row.severity}
                              </span>
                            </div>
                            <div className="mt-3 grid gap-3 sm:grid-cols-2">
                              <div className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2.5">
                                <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500">Instances</p>
                                <p className="mt-1 text-sm font-semibold text-slate-950">{row.instanceCount}</p>
                              </div>
                              <div className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2.5">
                                <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500">Likely WCAG criteria</p>
                                <p className="mt-1 text-sm font-semibold text-slate-950">{formatWcagCriteria(row.criteria)}</p>
                              </div>
                            </div>
                            <p className="mt-3 text-sm text-slate-700">
                              <span className="font-medium text-slate-900">Why it matters:</span> {row.impact}
                            </p>
                            {row.description ? (
                              <p className="mt-2 text-sm text-slate-700">
                                <span className="font-medium text-slate-900">Representative issue:</span> {row.description}
                              </p>
                            ) : null}
                            <p className="mt-2 text-sm text-slate-700">
                              <span className="font-medium text-slate-900">Fix first:</span> {row.remediation}
                            </p>
                            {row.representativeSelectors.length > 0 ? (
                              <div className="mt-3 space-y-1">
                                <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Representative selectors</p>
                                {row.representativeSelectors.slice(0, 3).map((selector) => (
                                  <code
                                    key={`${row.ruleCode}-${selector}`}
                                    className="block overflow-hidden rounded-lg bg-slate-100 px-2 py-1 text-xs text-slate-700"
                                  >
                                    {selector}
                                  </code>
                                ))}
                              </div>
                            ) : null}
                            {row.pageUrl ? (
                              <p className="mt-3 text-sm text-slate-700">
                                <span className="font-medium text-slate-900">Observed on:</span>{" "}
                                <a className="break-all underline underline-offset-2" href={row.pageUrl} rel="noreferrer" target="_blank">
                                  {row.pageUrl}
                                </a>
                              </p>
                            ) : null}
                            {row.helpUrl ? (
                              <p className="mt-2 text-sm text-slate-700">
                                <span className="font-medium text-slate-900">WCAG / axe guidance:</span>{" "}
                                <a className="underline underline-offset-2" href={row.helpUrl} rel="noreferrer" target="_blank">
                                  {row.help ?? row.helpUrl}
                                </a>
                              </p>
                            ) : null}
                            <p className="mt-2 text-xs text-slate-500">
                              Evidence source: {row.pageUrl ? "persisted accessibility rule examples from the browser audit." : "aggregated accessibility rule counts from the browser audit."}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </CollapsibleSectionCard>
              </StaticSubsection>

              <ResultCategorySection
                title="Sensitive collection and consumer-risk signals"
                staticSection
                collapseDetails
                detailsTitle="Sensitive collection detail signals"
                collapsible={false}
                metrics={[
                  {
                    label: "Sensitive collection",
                    value: formatCompactValue(snapshot.high_sensitivity_data_collection_detected),
                    tooltip:
                      "Whether the scan detected observed signals that the site may request more sensitive categories of personal or identity-related information."
                  },
                  {
                    label: "SSN collection",
                    value: formatCompactValue(snapshot.form_collects_ssn),
                    tooltip:
                      "Whether form labels, placeholders, names, or nearby text suggested SSN or social-security-number collection."
                  },
                  {
                    label: "Government ID",
                    value: formatCompactValue(snapshot.form_collects_government_id),
                    tooltip:
                      "Whether the scan observed explicit form signals suggesting passport, driver's license, national ID, or similar government-ID collection."
                  },
                  {
                    label: "Financial info",
                    value: formatCompactValue(snapshot.form_collects_financial_information),
                    tooltip:
                      "Whether public-facing forms appeared to request bank, routing, salary, card, or comparable financial information."
                  }
                ]}
                details={[
                  { label: "Health information", value: snapshot.form_collects_health_information },
                  { label: "Birthdate collection", value: snapshot.form_collects_birthdate },
                  { label: "Geolocation collection", value: snapshot.form_collects_geolocation },
                  { label: "Date-of-birth input", value: snapshot.date_of_birth_input_present },
                  { label: "Payment-card input", value: snapshot.payment_card_input_present },
                  { label: "Address input", value: snapshot.address_input_present },
                  { label: "Age gate", value: snapshot.age_gate_present },
                  { label: "Parental consent reference", value: snapshot.parental_consent_reference_present }
                ]}
              />
            </TopLevelEvidenceSection>
          </div>
        </div>
      ) : null}

      <RegulatoryRiskSection risk={scanRecord.regulatoryRisk} agencyMappings={scanRecord.agencyMappings} />

      {snapshot ? (
        <CollapsibleSectionCard
          title={
            <span className="flex items-center gap-1.5">
              <span>AI, Automation & Emerging Practices</span>
              <InfoTip text="AI assistants, automation disclosures, AI answer experiences, and related emerging-practice signals are intentionally separated from the core privacy and accessibility evidence above." />
            </span>
          }
          defaultOpen
          contentClassName="space-y-4"
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
              {scanRecord.signals.map((signal) => (
                <div key={signal.key} className="rounded-2xl border border-slate-200 p-4">
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

        <CollapsibleSectionCard
          title={
            <span className="flex items-center gap-1.5">
              <span>Execution profile</span>
              <InfoTip text="The scan plan and runtime budget selected for this run, including crawl depth, concurrency, and browser behavior settings." />
            </span>
          }
          contentClassName="grid gap-2 text-sm text-slate-600 md:grid-cols-2 xl:grid-cols-4"
        >
          <p>Profile: {formatValue(executionPlan.profile)}</p>
          <p>Planned pages: {formatValue(executionPlan.pagesRequested)}</p>
          <p>Prefetch targets: {formatValue(executionPlan.prefetchTargetCount)}</p>
          <p>Expansion targets: {formatValue(executionPlan.expansionTargetCount)}</p>
          <p>Static fetch concurrency: {formatValue(executionPlan.staticFetchConcurrency)}</p>
          <p>Browser nav timeout: {formatValue(executionPlan.browserNavigationTimeoutMs)}</p>
          <p>Browser post-load wait: {formatValue(executionPlan.browserPostLoadWaitMs)}</p>
          <p>Block stylesheets: {formatValue(executionPlan.blockStylesheetsInBrowser)}</p>
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

        <CollapsibleSectionCard
          title={
            <span className="flex items-center gap-1.5">
              <span>Scan events</span>
              <InfoTip text="The event log recorded while this scan ran, including crawl milestones, persistence steps, and derived processing stages." />
            </span>
          }
        >
          {scanRecord.events.length === 0 ? (
            <p className="text-sm text-slate-600">No scan events have been recorded for this scan yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead>
                  <tr className="text-left text-slate-500">
                    <th className="pb-2 pr-4 font-medium">Time</th>
                    <th className="pb-2 pr-4 font-medium">Event</th>
                    <th className="pb-2 pr-4 font-medium">Message</th>
                    <th className="pb-2 font-medium">Metadata</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {scanRecord.events.map((event) => (
                    <tr key={event.id} className="align-top">
                      <td className="py-2 pr-4 whitespace-nowrap text-slate-500">{formatDateTime(event.createdAt)}</td>
                      <td className="py-2 pr-4 text-slate-700">{event.eventType}</td>
                      <td className="py-2 pr-4 text-slate-900">{event.message}</td>
                      <td className="py-2 font-mono text-xs text-slate-500">{formatEventMetadata(event.metadataJson)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CollapsibleSectionCard>
      </CollapsibleSectionCard>
    </div>
  );
}
