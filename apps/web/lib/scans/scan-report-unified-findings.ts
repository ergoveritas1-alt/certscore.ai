import {
  REPORT_PRIMARY_PILLARS,
  getReportEvidenceCategoriesForSection,
  getReportSectionsForPillar,
  getReportSignalsForEvidenceCategory,
  type PreviewSampleFinding,
  type ReportEvidenceCategoryDefinition,
  type ReportPrimaryPillarDefinition,
  type ReportSectionDefinition
} from "@website-signal-risk-scanner/shared";
import type { ScanDetailResponse } from "../../server/scans/get-scan-by-id";
import { buildValidationFindingLookup } from "./validation-review-linking";
import { buildUnifiedFindingDisplayPackets } from "./unified-findings";
import type { UnifiedFindingDisplayPacket } from "./unified-findings";
import {
  dedupeHeadlineFindings,
  deriveConsentAuditFindings
} from "./consent-audit-findings";
import {
  buildPreconsentEvidenceQualityFallback,
  getHybridDerivedSignalValue,
  getHybridSignalFallbackEvidence
} from "./hybrid-runtime-evidence";
import { deriveHighRiskTrackingContext } from "./high-risk-tracking-context";
import {
  evaluatePolicyBehaviorContradictionEvidence,
  getAllowedConflictType,
  getContradictionEvidenceBundle,
  type PolicyBehaviorConflictClaimType,
  type PolicyBehaviorConflictType,
  type PolicyBehaviorRuntimeObservationType
} from "./contradiction-evidence-contract";
import { REJECT_TRACKING_CONFIRMATION_MIN_MS } from "./reject-tracking-policy";
import { findMergedSignalValue, getReportSignalValue, isSignalValuePopulated } from "./report-signal-values";
import {
  getPolicyEvidenceSnippets,
  getPolicyPageType,
  getPolicyPageUrl,
  getPolicySummaryText
} from "./policy-enrichment-row";
import { normalizePolicySnippet } from "./policy-snippet-normalization";
import { evaluateConsentSurfaceGate } from "./promotion-evidence-contracts";
import {
  buildReviewFindings,
  buildSectionReviewIssues,
  formatReviewIssueDescription,
  type AccessibilityIssueRow,
  type AccessibilityRuleEvidenceRow,
  type CanonicalReviewFinding,
  type CanonicalSignalItem,
  type PolicyBehaviorContradiction,
  type PreconsentViolationRow,
  type ScanReportReviewIssueRow
} from "./scan-report-review-findings";
import { groupSnapshotFieldsByPrimaryCategory } from "./signal-taxonomy";

export type ScanReportUnifiedFindingSectionDraft = {
  categories?: Array<{
    category: ReportEvidenceCategoryDefinition;
    emptySignalCount?: number;
    items: CanonicalSignalItem[];
    reviewFindings: CanonicalReviewFinding[];
  }>;
  issueFindings?: CanonicalReviewFinding[];
  pillar?: ReportPrimaryPillarDefinition;
  section?: ReportSectionDefinition;
  sectionCategoryIds: Set<string>;
};

export type ScanReportUnifiedFindingState = {
  allReviewFindingCandidates?: CanonicalReviewFinding[];
  derivedContext: {
    accessibilityIssueRows: AccessibilityIssueRow[];
    accessibilityRuleEvidenceRows: AccessibilityRuleEvidenceRow[];
    consentAuditFindings: PreviewSampleFinding[];
    policyBehaviorContradictions: PolicyBehaviorContradiction[];
    preconsentViolationRows: PreconsentViolationRow[];
    prioritizedAccessibilityRuleRows: AccessibilityRuleEvidenceRow[];
    scanReportReviewIssues: ScanReportReviewIssueRow[];
    taxonomySnapshotSections: Array<{ description: string; fields: string[]; title: string }>;
  };
  globalUnifiedFindings: UnifiedFindingDisplayPacket[];
  sectionDrafts: Array<{
    pillar?: ReportPrimaryPillarDefinition;
    sections: ScanReportUnifiedFindingSectionDraft[];
  }>;
};

export type ScanReportUnifiedFindingStateDependencies = {
  deriveAccessibilityIssueRows: (snapshot: Record<string, unknown>) => AccessibilityIssueRow[];
  deriveAccessibilityRuleEvidenceRows: (input: {
    examples: NonNullable<ScanDetailResponse["accessibilityRuleExamples"]>;
    ruleCounts: NonNullable<ScanDetailResponse["accessibilityRuleCounts"]>;
  }) => AccessibilityRuleEvidenceRow[];
  deriveConsentAuditFindings: (
    snapshot: Record<string, unknown> | null,
    runtimeArtifacts: Record<string, unknown> | null
  ) => PreviewSampleFinding[];
  derivePolicyBehaviorContradictions: (input: {
    mergedSignals: ScanDetailResponse["mergedSignals"];
    primaryPolicyEnrichment: ScanDetailResponse["primaryPolicyEnrichment"];
    policyEnrichments: ScanDetailResponse["policyEnrichment"];
    preconsentViolations: PreconsentViolationRow[];
    runtimeArtifacts: Record<string, unknown> | null;
    snapshot: Record<string, unknown> | null;
    trackerVendors: ScanDetailResponse["trackerVendors"];
  }) => PolicyBehaviorContradiction[];
  derivePreconsentViolationRows: (input: {
    persistedViolations: ScanDetailResponse["preconsentViolations"];
    runtimeArtifacts: Record<string, unknown> | null;
    trackerVendors: ScanDetailResponse["trackerVendors"];
  }) => PreconsentViolationRow[];
  filterContradictoryPositiveSurfaceFindings: (findings: UnifiedFindingDisplayPacket[]) => UnifiedFindingDisplayPacket[];
};

function uniqueStrings(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => typeof value === "string" && value.trim().length > 0))];
}

function getFiniteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function getSnapshotNumber(snapshot: Record<string, unknown>, key: string) {
  return getFiniteNumber(snapshot[key]) ?? 0;
}

function getRecordStringArray(record: Record<string, unknown> | null | undefined, key: string) {
  const value = record?.[key];
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

function getPolicySnippetValues(row: Record<string, unknown> | null) {
  if (!row) {
    return [];
  }

  const snippets = getPolicyEvidenceSnippets(row);
  const snippetValues = snippets && typeof snippets === "object" ? Object.values(snippets) : [];

  return uniqueStrings([
    ...snippetValues.map((value) => (typeof value === "string" ? normalizePolicySnippet(value) : null)),
    getPolicySummaryText(row) ? normalizePolicySnippet(getPolicySummaryText(row) ?? "") : null
  ]);
}

function getPolicyRowNumber(row: Record<string, unknown> | null, keys: string[]) {
  for (const key of keys) {
    const value = row?.[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }

  return null;
}

function getPolicyRowString(row: Record<string, unknown> | null, keys: string[]) {
  for (const key of keys) {
    const value = row?.[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }

  return null;
}

function hasContradictionGradePolicyExtraction(row: Record<string, unknown> | null) {
  const policyPageUrl = row ? getPolicyPageUrl(row) : null;
  const semanticConfidence = getPolicyRowNumber(row, ["policy_semantic_confidence", "policySemanticConfidence"]);
  const coverageRatio = getPolicyRowNumber(row, ["policy_coverage_ratio", "policyCoverageRatio"]);
  const extractionStatus = getPolicyRowString(row, ["policy_extraction_status", "policyExtractionStatus"]) ?? "fetched";
  const snippetCount = getPolicyRowNumber(row, ["policy_snippet_count", "policySnippetCount"]);

  return Boolean(
    policyPageUrl &&
      extractionStatus === "fetched" &&
      (semanticConfidence === null || semanticConfidence >= 0.55) &&
      (coverageRatio === null || coverageRatio >= 0.25) &&
      (snippetCount === null || snippetCount > 0)
  );
}

function deriveConsentGatingPolicyAnchor(row: Record<string, unknown> | null) {
  const snippets = getPolicySnippetValues(row);
  const policyPageUrl = row ? getPolicyPageUrl(row) : null;
  const semanticConfidence = getPolicyRowNumber(row, ["policy_semantic_confidence", "policySemanticConfidence"]);

  if (!hasContradictionGradePolicyExtraction(row)) {
    return null;
  }

  for (const snippet of snippets) {
    const lowerSnippet = snippet.toLowerCase();
    const mentionsNonEssential =
      /optional|non[-\s]?essential|analytics|advertis(?:e|ing)|marketing|tracking|targeting|performance/.test(lowerSnippet);
    const mentionsConsent = /consent|choice|permission|opt[-\s]?in|accept|agree/.test(lowerSnippet);
    const necessaryOnly =
      /(only|solely|strictly)\s+(necessary|required|essential)/.test(lowerSnippet) ||
      /necessary cookies? (?:only|until|before)/.test(lowerSnippet);
    const marketingBeforeConsent =
      /(advertis(?:e|ing)|marketing|tracking|targeting|analytics).{0,80}(consent|choice|permission|opt[-\s]?in)/.test(lowerSnippet) ||
      /(consent|choice|permission|opt[-\s]?in).{0,80}(advertis(?:e|ing)|marketing|tracking|targeting|analytics)/.test(lowerSnippet);
    const rejectDisablesTracking =
      /(reject|decline|disable|turn off).{0,80}(analytics|advertis(?:e|ing)|marketing|tracking|targeting|non[-\s]?essential)/.test(lowerSnippet);
    const vagueConsentReference =
      /(?:we value your privacy|may use cookies|use cookies to improve|cookies and similar technologies)/.test(lowerSnippet) &&
      !necessaryOnly &&
      !marketingBeforeConsent &&
      !rejectDisablesTracking;

    if (vagueConsentReference) {
      continue;
    }

    let claimType: PolicyBehaviorConflictClaimType | null = null;
    if (necessaryOnly && mentionsConsent) {
      claimType = "only_necessary_cookies_before_choice";
    } else if ((mentionsNonEssential && mentionsConsent) || marketingBeforeConsent || rejectDisablesTracking) {
      claimType = "no_marketing_tracking_before_consent";
    }

    if (!claimType) {
      continue;
    }

    return {
      claimType,
      confidence: semanticConfidence ?? 0.82,
      extractionStatus: "fetched",
      normalizedClaim: snippet,
      snippet,
      sourceUrl: policyPageUrl
    };
  }

  return null;
}

function deriveConsentGatingPolicyAnchorFromRows(rows: Array<Record<string, unknown>>) {
  const privacyPolicyAnchor = rows
    .filter((row) => getPolicyPageType(row) === "privacy_policy" || getPolicyPageType(row) === "cookie_policy")
    .map((row) => deriveConsentGatingPolicyAnchor(row))
    .find(Boolean);
  if (privacyPolicyAnchor) {
    return privacyPolicyAnchor;
  }

  return rows.map((row) => deriveConsentGatingPolicyAnchor(row)).find(Boolean) ?? null;
}

function derivePreconsentObservationType(
  preconsentRows: Array<{ vendorCategory: string; vendorName: string }>
): PolicyBehaviorRuntimeObservationType | null {
  const categories = preconsentRows
    .map((row) => (typeof row.vendorCategory === "string" ? row.vendorCategory.toLowerCase() : ""))
    .filter((value) => value.length > 0);
  const vendorNames = preconsentRows
    .map((row) => (typeof row.vendorName === "string" ? row.vendorName.toLowerCase() : ""))
    .filter((value) => value.length > 0);
  const haystack = [...categories, ...vendorNames].join(" ");

  if (/advertis|marketing|adtech|retarget|targeting|social|doubleclick|facebook|linkedin|reddit|tiktok|snap/.test(haystack)) {
    return "marketing_vendor_fired_pre_consent";
  }
  if (/analytics|measurement|session[_\s-]?replay|replay|hotjar|clarity|fullstory|google analytics|ga4/.test(haystack)) {
    return "analytics_vendor_fired_pre_consent";
  }

  return preconsentRows.length > 0 ? "analytics_vendor_fired_pre_consent" : null;
}

function derivePolicyBehaviorContradictions(input: {
  mergedSignals?: Array<{
    key: string;
    value: boolean | number | string | string[] | null;
    selectedPopulation?: { value?: boolean | number | string | string[] | null } | null;
  }>;
  primaryPolicyEnrichment?: Record<string, unknown> | null;
  policyEnrichments: Array<Record<string, unknown>>;
  preconsentViolations: Array<{
    evidenceUrls: string[];
    scriptHost?: string | null;
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
}): PolicyBehaviorContradiction[] {
  const privacyEnrichment =
    input.primaryPolicyEnrichment ??
    input.policyEnrichments.find((row) => getPolicyPageType(row) === "privacy_policy") ??
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
  const mergedPolicyFlags = findMergedSignalValue(input.mergedSignals, "policyActionableFlags");
  const policyFlags = Array.isArray(mergedPolicyFlags)
    ? mergedPolicyFlags.filter((value): value is string => typeof value === "string")
    : [];
  const mergedPolicyDoNotSell = findMergedSignalValue(input.mergedSignals, "policyDoNotSell");
  const policyDoNotSell = typeof mergedPolicyDoNotSell === "string" ? mergedPolicyDoNotSell : "unknown";
  const policyPageUrl = privacyEnrichment ? getPolicyPageUrl(privacyEnrichment) : null;
  const policySummary = privacyEnrichment ? getPolicySummaryText(privacyEnrichment) : null;
  const consentGatingAnchor = deriveConsentGatingPolicyAnchorFromRows(input.policyEnrichments);

  if (preconsentVendors.length > 0) {
    const runtimeObservationType = derivePreconsentObservationType(input.preconsentViolations);
    const conflictType = consentGatingAnchor
      ? getAllowedConflictType(consentGatingAnchor.claimType, runtimeObservationType)
      : null;
    const hasConcreteRuntimeRequest = preconsentEvidence.some((url) => /^https?:\/\//i.test(url));
    const preconsentScriptHosts = uniqueStrings(input.preconsentViolations.map((row) => row.scriptHost));
    const conflictSupportsPromotion = Boolean(
      consentGatingAnchor?.sourceUrl &&
        consentGatingAnchor.snippet &&
        runtimeObservationType &&
        conflictType &&
        hasConcreteRuntimeRequest &&
        preconsentVendors.length > 0
    );
    const policyClaim =
      consentGatingAnchor?.normalizedClaim ??
      "The policy and consent surface imply tracking should begin only after a valid consent interaction.";
    const runtimeSummary = `Trackers fired on first render before consent interaction: ${preconsentVendors.join(", ")}.`;

    contradictions.push({
      title: "Consent-gated tracking claim conflicts with runtime behavior",
      status: "violation risk",
      severity: "high",
      claim: policyClaim,
      observedBehavior: runtimeSummary,
      evidence: preconsentEvidence.slice(0, 3),
      policyPageUrl: consentGatingAnchor?.sourceUrl ?? policyPageUrl,
      policyClaimType: consentGatingAnchor?.claimType ?? null,
      policyConfidence: consentGatingAnchor?.confidence ?? null,
      policyExtractionStatus: consentGatingAnchor?.extractionStatus ?? null,
      policySnippet: consentGatingAnchor?.snippet ?? null,
      policySummary,
      relatedVendors: preconsentVendors,
      runtimeConfidence: hasConcreteRuntimeRequest ? 0.82 : 0.5,
      runtimeObservationType,
      runtimePhase: "pre_consent",
      runtimeScriptHosts: preconsentScriptHosts,
      runtimeSummary,
      runtimeVendors: preconsentVendors,
      conflictReasoning:
        consentGatingAnchor && runtimeObservationType
          ? "The policy anchor describes consent-gated non-essential tracking, while runtime evidence shows tracker requests before consent."
          : runtimeSummary,
      conflictSupportsPromotion,
      conflictType,
      supportingSignals: uniqueStrings([
        "consent_gating_claim",
        ...preconsentScriptHosts.map((host) => `preconsent_script_host:${host}`)
      ])
    });
  }

  if ((policyDoNotSell === "present_link" || policyDoNotSell === "present_text") && advertisingVendors.length > 0) {
    contradictions.push({
      title: "Do-not-sell / sharing disclosure conflicts with observed adtech stack",
      status: "likely contradiction",
      severity: "medium",
      claim: "The policy makes an explicit do-not-sell or sharing disclosure, which raises the bar for consistency around third-party marketing data use.",
      observedBehavior: `Advertising or retargeting vendors were observed at runtime: ${advertisingVendors.join(", ")}.`,
      evidence: advertisingVendors.slice(0, 4),
      policyPageUrl,
      policySnippet: "The policy makes an explicit do-not-sell or sharing disclosure, which raises the bar for consistency around third-party marketing data use.",
      policySummary,
      relatedVendors: advertisingVendors,
      runtimeSummary: `Advertising or retargeting vendors were observed at runtime: ${advertisingVendors.join(", ")}.`,
      runtimeVendors: advertisingVendors,
      supportingSignals: [policyDoNotSell]
    });
  }

  if (hasPolicyBehaviorConflict || policyFlags.includes("policy_behavior_conflict_candidate")) {
    const relatedVendors = uniqueStrings([...advertisingVendors, ...sessionReplayVendors, ...preconsentVendors]).slice(0, 6);

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
      evidence: [...preconsentEvidence.slice(0, 2), ...advertisingVendors.slice(0, 2), ...sessionReplayVendors.slice(0, 1)].slice(0, 4),
      policyPageUrl,
      policySnippet: "Observed runtime behavior appears to conflict with policy representations about tracking or third-party data use.",
      policySummary,
      relatedVendors,
      runtimeSummary:
        advertisingVendors.length > 0
          ? `Observed adtech vendors include ${advertisingVendors.join(", ")}${sessionReplayVendors.length > 0 ? `; session replay tooling includes ${sessionReplayVendors.join(", ")}.` : "."}`
          : trackerVendors.length > 0
            ? `Observed tracker vendors include ${trackerVendors.slice(0, 6).join(", ")}.`
            : "The scan flagged a policy/behavior conflict based on runtime evidence and policy semantics.",
      runtimeVendors: relatedVendors,
      supportingSignals: uniqueStrings([
        hasPolicyBehaviorConflict ? "policy_behavior_conflict_detected" : null,
        policyFlags.includes("policy_behavior_conflict_candidate") ? "policy_behavior_conflict_candidate" : null
      ])
    });
  }

  return contradictions.filter(
    (row, index, rows) =>
      rows.findIndex((candidate) => candidate.title === row.title && candidate.observedBehavior === row.observedBehavior) === index
  );
}

function derivePreconsentViolationRows(input: {
  persistedViolations: ScanDetailResponse["preconsentViolations"];
  runtimeArtifacts: Record<string, unknown> | null;
  trackerVendors: ScanDetailResponse["trackerVendors"];
}): PreconsentViolationRow[] {
  if (input.persistedViolations.length > 0) {
    return input.persistedViolations;
  }

  const baselineTrackerVendors = getRecordStringArray(input.runtimeArtifacts, "consent_baseline_tracker_vendor_names");
  const baselineEvidenceUrls = getRecordStringArray(input.runtimeArtifacts, "consent_baseline_tracker_evidence_urls");
  const baselineScriptHosts = getRecordStringArray(input.runtimeArtifacts, "consent_baseline_tracker_script_hosts");
  const highRiskContext = deriveHighRiskTrackingContext({
    runtimeArtifacts: input.runtimeArtifacts,
    evidenceUrls: baselineEvidenceUrls
  });
  const synthesizedHighRiskVendors = highRiskContext.highRiskVendors.filter(
    (vendor) => !baselineTrackerVendors.some((name) => name.toLowerCase() === vendor.name.toLowerCase())
  );
  const vendorNames = uniqueStrings([
    ...baselineTrackerVendors,
    ...synthesizedHighRiskVendors.map((vendor) => vendor.name)
  ]);

  return vendorNames.map((vendorName) => {
    const tracker = input.trackerVendors.find((candidate) => candidate.vendorName === vendorName);
    const highRiskVendor = synthesizedHighRiskVendors.find((candidate) => candidate.name === vendorName);
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

      if (highRiskVendor) {
        return highRiskVendor.evidence.some((evidence) => lowerUrl.includes(evidence.toLowerCase())) ||
          lowerUrl.includes(lowerVendor.replace(/\s+|\/.*/g, ""));
      }

      return lowerUrl.includes(lowerVendor.replace(/\s+/g, ""));
    });

    return {
      collectionEndpointType: tracker?.collectionEndpointType ?? "unknown",
      confidence: tracker?.confidence ?? (highRiskVendor ? 0.86 : 0),
      detectionSource: tracker?.detectionSource ?? "runtime_audit",
      evidenceUrls: vendorEvidenceUrls.length > 0 ? vendorEvidenceUrls : highRiskVendor?.evidence.filter((value) => /^https?:\/\//i.test(value)) ?? [],
      firstPartyOrThirdParty: "unknown",
      matchedSignatureId: tracker?.matchedSignatureId ?? null,
      scriptHost:
        tracker?.scriptHost ??
        baselineScriptHosts.find((host) => host && host.toLowerCase().includes(vendorName.toLowerCase().replace(/\s+/g, ""))) ??
        highRiskVendor?.evidence.find((value) => !/^https?:\/\//i.test(value)) ??
        null,
      vendorCategory: tracker?.vendorCategory ?? highRiskVendor?.category ?? "unknown",
      vendorName
    };
  });
}

function deriveAccessibilityIssueRows(snapshot: Record<string, unknown>): AccessibilityIssueRow[] {
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

function getAccessibilityRuleMetadata(ruleCode: string, ruleGroup: string) {
  const metadataByRuleCode: Record<string, { criteria: string[]; family: string; impact: string; remediation: string }> = {
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
    label: {
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
    }
  };

  const metadataByRuleGroup: Record<string, { criteria: string[]; family: string; impact: string; remediation: string }> = {
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
    metadataByRuleCode[ruleCode] ??
    metadataByRuleGroup[ruleGroup] ?? {
      criteria: ["WCAG review needed"],
      family: "Other",
      impact: "Automated accessibility issues were detected in this rule family.",
      remediation: "Review the affected components and validate the issue against the relevant WCAG success criteria."
    }
  );
}

function deriveAccessibilityRuleEvidenceRows(input: {
  examples: NonNullable<ScanDetailResponse["accessibilityRuleExamples"]>;
  ruleCounts: NonNullable<ScanDetailResponse["accessibilityRuleCounts"]>;
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
      impact: null,
      nodeCount: rule.instanceCount,
      pageUrl: null,
      representativeSelectors: [],
      severity: rule.severity,
      weightedPriority
    };
  });
}

function getRuntimeObject(input: Record<string, unknown> | null, keys: string[]) {
  for (const key of keys) {
    const value = input?.[key];
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
  }
  return null;
}

function getRuntimeObjectArray(input: Record<string, unknown> | null, keys: string[]) {
  for (const key of keys) {
    const value = input?.[key];
    if (Array.isArray(value)) {
      return value.filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object" && !Array.isArray(entry));
    }
  }
  return [];
}

function getNativeContradictionPacketSources(runtimeArtifacts: Record<string, unknown> | null) {
  return [
    runtimeArtifacts,
    getRuntimeObject(runtimeArtifacts, ["hybridRuntimeEvidence", "hybrid_runtime_evidence"]),
    getRuntimeObject(runtimeArtifacts, ["sanitizedNetworkEvidence", "sanitized_network_evidence"])
  ].filter((source): source is Record<string, unknown> => Boolean(source));
}

function hasNativeContradictionPacketTriplet(source: Record<string, unknown>) {
  return (
    getRuntimeObjectArray(source, ["policyClaimCandidates", "policy_claim_candidates"]).length > 0 &&
    getRuntimeObjectArray(source, ["runtimeBehaviorArtifacts", "runtime_behavior_artifacts"]).length > 0
  );
}

function getRuntimeStringArray(input: Record<string, unknown> | null, keys: string[]) {
  const values: string[] = [];
  for (const key of keys) {
    const value = input?.[key];
    if (Array.isArray(value)) {
      values.push(...value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0));
    }
  }
  return [...new Set(values)];
}

function getRuntimeBoolean(input: Record<string, unknown> | null, keys: string[]) {
  for (const key of keys) {
    if (typeof input?.[key] === "boolean") {
      return input[key] as boolean;
    }
  }
  return null;
}

function buildRuntimeDerivedReviewFindingCandidates(input: {
  runtimeArtifacts: Record<string, unknown> | null;
}): CanonicalReviewFinding[] {
  const candidates: CanonicalReviewFinding[] = [];
  const nativeContradictionPacketSource = getNativeContradictionPacketSources(input.runtimeArtifacts).find((source) => {
    if (!hasNativeContradictionPacketTriplet(source)) {
      return false;
    }
    const decision = evaluatePolicyBehaviorContradictionEvidence(source);
    return (
      !decision.eligible &&
      decision.negativeEvidenceFlags.includes("missing_bridge_provenance") &&
      !decision.negativeEvidenceFlags.includes("missing_policy_side_evidence") &&
      !decision.negativeEvidenceFlags.includes("missing_runtime_anchor") &&
      !decision.negativeEvidenceFlags.includes("missing_specific_runtime_artifact") &&
      !decision.negativeEvidenceFlags.includes("boilerplate_policy_anchor") &&
      !decision.negativeEvidenceFlags.includes("weak_policy_anchor")
    );
  });
  const nativeContradictionBundle = getContradictionEvidenceBundle(nativeContradictionPacketSource);
  if (nativeContradictionPacketSource && nativeContradictionBundle) {
    const policyAnchorId = nativeContradictionBundle.conflictBridge.provenance.policyAnchorRef || nativeContradictionBundle.policyAnchor.sourceUrl || "policy";
    const runtimeAnchorId =
      nativeContradictionBundle.conflictBridge.provenance.runtimeAnchorRef ||
      nativeContradictionBundle.runtimeAnchor.requests[0] ||
      nativeContradictionBundle.runtimeAnchor.cookies[0] ||
      nativeContradictionBundle.runtimeAnchor.storageArtifacts[0] ||
      "runtime";
    candidates.push({
      categoryId: "policy_clarity_consistency_review",
      description:
        "WS01 retained a specific policy claim and concrete runtime behavior anchor, but no stable bridge provenance was retained for promotion.",
      fallbackEvidence: {
        ...nativeContradictionPacketSource,
        candidateReviewStatus: "candidate_insufficient_bridge_provenance",
        signalKey: "context.policy_behavior_conflict_detected",
        signalLabel: "Policy/behavior conflict detected",
        signalValue: true,
        unifiedFindingId: "policy_behavior_conflict"
      },
      id: `runtime-derived-signal-context.policy_behavior_conflict_detected.${policyAnchorId}.${runtimeAnchorId}`,
      linkedValidationFinding: null,
      observedValue: "Candidate missing stable bridge provenance",
      severity: "high",
      signalKey: "context.policy_behavior_conflict_detected",
      signalLabel: "Policy/behavior conflict detected",
      signalSource: "runtime_artifact_signal",
      sourceType: "signal",
      title: "Policy/behavior conflict detected"
    });
  }

  const preconsentEvidenceQuality = buildPreconsentEvidenceQualityFallback(input.runtimeArtifacts);
  const preconsentEvidenceRecord = preconsentEvidenceQuality as Record<string, unknown> | null;
  const consentTimeline =
    getRuntimeObject(input.runtimeArtifacts, ["consentTimeline", "consent_timeline"]) ??
    getRuntimeObject(preconsentEvidenceRecord, ["consentTimeline", "consent_timeline"]);
  const directRequestClassifications = getRuntimeObjectArray(input.runtimeArtifacts, [
    "requestPurposeClassificationConfidence",
    "request_purpose_classification_confidence"
  ]);
  const fallbackRequestClassifications = getRuntimeObjectArray(preconsentEvidenceRecord, [
    "requestPurposeClassificationConfidence",
    "request_purpose_classification_confidence"
  ]);
  const requestClassifications =
    directRequestClassifications.length > 0 ? directRequestClassifications : fallbackRequestClassifications;
  const rejectPath = getRuntimeObject(input.runtimeArtifacts, [
    "rejectPathDepthAndAvailability",
    "reject_path_depth_and_availability"
  ]);
  const botBlockChallengeEvidence = getRuntimeObject(input.runtimeArtifacts, [
    "botBlockChallengeEvidence",
    "bot_block_challenge_evidence"
  ]);
  const firstNonEssentialRequestMs = getFiniteNumber(
    consentTimeline?.firstNonEssentialRequestMs ?? consentTimeline?.first_non_essential_request_ms
  );
  const firstCmpVisibleMs = getFiniteNumber(consentTimeline?.firstCmpVisibleMs ?? consentTimeline?.first_cmp_visible_ms);
  const firstConsentActionMs = getFiniteNumber(consentTimeline?.firstConsentActionMs ?? consentTimeline?.first_consent_action_ms);
  const firstRejectActionMs = getFiniteNumber(consentTimeline?.firstRejectActionMs ?? consentTimeline?.first_reject_action_ms);
  const firstAcceptActionMs = getFiniteNumber(consentTimeline?.firstAcceptActionMs ?? consentTimeline?.first_accept_action_ms);
  const firstUserActionMs = getFiniteNumber(consentTimeline?.firstUserActionMs ?? consentTimeline?.first_user_action_ms);
  const consentSurfaceObserved =
    getRuntimeBoolean(input.runtimeArtifacts, [
      "consentSurfaceObserved",
      "consent_surface_observed"
    ]) ??
    getRuntimeBoolean(preconsentEvidenceRecord, [
      "consentSurfaceObserved",
      "consent_surface_observed"
    ]);
  const consentActionableChoiceObserved =
    getRuntimeBoolean(input.runtimeArtifacts, [
      "consentActionableChoiceObserved",
      "consent_actionable_choice_observed"
    ]) ??
    getRuntimeBoolean(preconsentEvidenceRecord, [
      "consentActionableChoiceObserved",
      "consent_actionable_choice_observed"
    ]);
  const nonEssentialRequestRows = requestClassifications.filter(
    (row) =>
      row.essentiality === "non_essential" &&
      typeof row.requestUrl === "string" &&
      /^https?:\/\//i.test(row.requestUrl) &&
      typeof row.confidence === "number" &&
      row.confidence >= 0.7
  );
  const retainedPreconsentEvidenceUrls = Array.isArray(preconsentEvidenceRecord?.preconsent_tracker_evidence_urls)
    ? (preconsentEvidenceRecord.preconsent_tracker_evidence_urls as unknown[]).filter(
        (value): value is string => typeof value === "string" && /^https?:\/\//i.test(value)
      )
    : [];
  const retainedState0RequestRows = Array.isArray(preconsentEvidenceRecord?.preconsent_state0_request_observations)
    ? (preconsentEvidenceRecord.preconsent_state0_request_observations as unknown[]).filter(
        (value): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value)
      )
    : [];
  const hasPreconsentSequence =
    firstNonEssentialRequestMs !== null &&
    ((firstCmpVisibleMs !== null && firstNonEssentialRequestMs < firstCmpVisibleMs) ||
      (firstConsentActionMs !== null && firstNonEssentialRequestMs < firstConsentActionMs) ||
      (
        consentSurfaceObserved === true &&
        consentActionableChoiceObserved === true &&
        firstConsentActionMs === null &&
        firstRejectActionMs === null &&
        firstAcceptActionMs === null &&
        firstUserActionMs === null
      ));

  if ((nonEssentialRequestRows.length > 0 && firstNonEssentialRequestMs !== null) || retainedState0RequestRows.length > 0) {
    const hasPromotionReadyRequestEvidence = nonEssentialRequestRows.length > 0 && firstNonEssentialRequestMs !== null;
    candidates.push({
      categoryId: "preconsent_tracking_incidents",
      description: hasPromotionReadyRequestEvidence && hasPreconsentSequence
        ? "A retained consent timeline places a non-essential request before the CMP was visible or before a consent action."
        : hasPromotionReadyRequestEvidence
          ? "A retained non-essential request classification exists, but the timing sequence is incomplete or ambiguous."
          : "A retained state-0 pre-consent request artifact exists, but request purpose, vendor attribution, or timing sequence evidence is incomplete.",
      fallbackEvidence: {
        consentTimeline,
        consentActionableChoiceObserved,
        consentSurfaceObserved,
        requestPurposeClassificationConfidence: requestClassifications,
        preconsent_tracker_evidence_urls: [
          ...new Set([
            ...nonEssentialRequestRows.map((row) => String(row.requestUrl)),
            ...retainedPreconsentEvidenceUrls
          ])
        ],
        preconsent_tracker_vendors: nonEssentialRequestRows
          .map((row) => (typeof row.vendor === "string" ? row.vendor : null))
          .filter((value): value is string => Boolean(value)),
        signalKey: "privacy.preconsent_tracking_detected",
        signalLabel: "Pre-consent tracking detected",
        signalValue: true,
        unifiedFindingId: "preconsent_tracking",
        ...(preconsentEvidenceQuality ?? {})
      },
      id: "runtime-derived-signal-privacy.preconsent_tracking_detected.evidence_quality",
      linkedValidationFinding: null,
      observedValue: hasPromotionReadyRequestEvidence
        ? `${nonEssentialRequestRows.length} classified non-essential request(s)`
        : `${retainedState0RequestRows.length} state-0 pre-consent request artifact(s) with incomplete classification`,
      severity: hasPromotionReadyRequestEvidence && hasPreconsentSequence ? "high" : "medium",
      signalKey: "privacy.preconsent_tracking_detected",
      signalLabel: "Pre-consent tracking detected",
      signalSource: "runtime_artifact_signal",
      sourceType: "signal",
      title: "Pre-consent tracking detected"
    });
  }

  const rejectInteractionSucceeded =
    rejectPath?.rejectInteractionSucceeded === true ||
    rejectPath?.reject_interaction_succeeded === true ||
    getRuntimeBoolean(input.runtimeArtifacts, [
      "consentRejectInteractionSucceeded",
      "consent_reject_interaction_succeeded"
    ]) === true;
  const postRejectRows = getRuntimeObjectArray(input.runtimeArtifacts, [
    "consentRejectPostRejectNonEssentialRequests",
    "consent_reject_post_reject_non_essential_requests"
  ]);
  if (rejectInteractionSucceeded && postRejectRows.length > 0) {
    const suppressionChecks = getRuntimeObject(input.runtimeArtifacts, [
      "consentRejectSuppressionChecks",
      "consent_reject_suppression_checks"
    ]);
    const rejectInteractionAttribution = getRuntimeObject(input.runtimeArtifacts, [
      "consentRejectInteractionAttribution",
      "consent_reject_interaction_attribution"
    ]);
    const promotionGradeRows = postRejectRows.filter((row) => {
      const category = typeof row.category === "string" ? row.category : "";
      const url = typeof row.url === "string" ? row.url : typeof row.requestUrl === "string" ? row.requestUrl : "";
      const vendor = typeof row.vendor === "string" ? row.vendor : "";
      const msAfterReject = row.ms_after_reject ?? row.msAfterReject;
      const tsMs = row.ts_ms ?? row.tsMs;
      return (
        typeof tsMs === "number" &&
        typeof msAfterReject === "number" &&
        msAfterReject >= REJECT_TRACKING_CONFIRMATION_MIN_MS &&
        /^(advertising|analytics|session_replay|marketing_automation|tag_manager)$/i.test(category) &&
        vendor.trim().length > 0 &&
        /^https?:\/\//i.test(url)
      );
    });
    const baselineTrackerEvidenceUrls = getRuntimeStringArray(input.runtimeArtifacts, [
      "consentBaselineTrackerEvidenceUrls",
      "consent_baseline_tracker_evidence_urls"
    ]);
    const postRejectTrackerEvidenceUrls = getRuntimeStringArray(input.runtimeArtifacts, [
      "consentPostRejectTrackerEvidenceUrls",
      "consent_post_reject_tracker_evidence_urls"
    ]);
    const postRejectRequestUrls = postRejectRows
      .map((row) => (typeof row.url === "string" ? row.url : typeof row.requestUrl === "string" ? row.requestUrl : null))
      .filter((url): url is string => Boolean(url && /^https?:\/\//i.test(url)));
    const persistedTrackerVendors = getRuntimeStringArray(input.runtimeArtifacts, [
      "consentRejectPersistedTrackerVendorNames",
      "consent_reject_persisted_tracker_vendor_names"
    ]);
    const postRejectTrackerVendors = getRuntimeStringArray(input.runtimeArtifacts, [
      "consentPostRejectTrackerVendorNames",
      "consent_post_reject_tracker_vendor_names"
    ]);
    const attributionClearsNavigationAmbiguity =
      rejectInteractionAttribution?.finalUrlHostChanged === false &&
      (
        !Array.isArray(rejectInteractionAttribution.navigationEventsAfterClick) ||
        rejectInteractionAttribution.navigationEventsAfterClick.length === 0
      );
    const navigationOrReloadAmbiguous =
      suppressionChecks?.navigation_or_reload_ambiguous === true && !attributionClearsNavigationAmbiguity;
    const confirmed = promotionGradeRows.length > 0 &&
      suppressionChecks?.cmp_initialization_only !== true &&
      !navigationOrReloadAmbiguous &&
      suppressionChecks?.baseline_contradiction_detected !== true;
    const runtimeEvidenceUrls = [
      ...baselineTrackerEvidenceUrls,
      ...postRejectTrackerEvidenceUrls,
      ...postRejectRequestUrls
    ];

    candidates.push({
      categoryId: "enforcement_outcomes_after_user_choice",
      description: "A retained reject interaction succeeded, and non-essential request activity was retained after reject.",
      fallbackEvidence: {
        consentBaselineTrackerEvidenceUrls: baselineTrackerEvidenceUrls,
        consentOptOutEvidenceLog: getRuntimeObjectArray(input.runtimeArtifacts, [
          "consentOptOutEvidenceLog",
          "consent_opt_out_evidence_log"
        ]),
        consentPostRejectTrackerEvidenceUrls: postRejectTrackerEvidenceUrls,
        consentRejectInteractionSucceeded: true,
        persisted_tracker_vendors: [...new Set([...persistedTrackerVendors, ...postRejectTrackerVendors])],
        post_reject_tracker_vendors: postRejectTrackerVendors,
        promotionDecision: {
          promoted: confirmed,
          reason: confirmed
            ? "Reject click, post-reject timing, vendor classification, and retained request URL satisfied promotion requirements."
            : "Retained post-reject request rows did not satisfy promotion-grade timing, attribution, or classification checks."
        },
        reject_did_not_reduce_tracking: true,
        rejectEvidenceConfidence: confirmed ? "confirmed" : "review",
        rejectInteractionAttribution,
        rejectPathDepthAndAvailability: rejectPath,
        runtimeEvidenceUrls,
        runtimeVendors: [...new Set([...postRejectTrackerVendors, ...persistedTrackerVendors])],
        sourceUrls: postRejectRequestUrls,
        postRejectNonEssentialRequests: postRejectRows,
        suppressionChecks,
        signalKey: "consent_reject_reduced_tracking",
        signalLabel: "Reject path did not reduce tracking",
        signalValue: false
      },
      id: "runtime-derived-signal-privacy.reject_did_not_reduce_tracking.evidence_quality",
      linkedValidationFinding: null,
      observedValue: `${postRejectRows.length} post-reject non-essential request(s)`,
      severity: "high",
      signalKey: "consent_reject_reduced_tracking",
      signalLabel: "Reject path did not reduce tracking",
      signalSource: "runtime_artifact_signal",
      sourceType: "signal",
      title: "Reject path did not reduce tracking"
    });
  }

  const preSubmitTextCaptureRows = getRuntimeObjectArray(input.runtimeArtifacts, [
    "preSubmitTextCaptureEvidence",
    "pre_submit_text_capture_evidence"
  ]);
  const strongPreSubmitTextCaptureRows = preSubmitTextCaptureRows.filter((row) => {
    const classification = String(row.destinationClassification ?? row.destination_classification ?? "");
    const submitObserved = row.submitObserved ?? row.submit_observed;
    return (
      submitObserved === false &&
      (classification === "third_party_tracking_hashed_identifier" ||
        classification === "third_party_tracking_raw_identifier")
    );
  });
  if (strongPreSubmitTextCaptureRows.length > 0) {
    candidates.push({
      categoryId: "sensitive_data_runtime_exposure",
      description: "A retained runtime probe observed typed text in a third-party tracking request before form submission.",
      fallbackEvidence: {
        preSubmitTextCaptureEvidence: strongPreSubmitTextCaptureRows,
        pre_submit_text_capture_evidence: strongPreSubmitTextCaptureRows,
        signalKey: "privacy.pre_submit_text_capture_detected",
        signalLabel: "Pre-submit text capture detected",
        signalValue: true
      },
      id: "runtime-derived-signal-privacy.pre_submit_text_capture_detected",
      linkedValidationFinding: null,
      observedValue: `${strongPreSubmitTextCaptureRows.length} pre-submit capture observation(s)`,
      severity: "high",
      signalKey: "privacy.pre_submit_text_capture_detected",
      signalLabel: "Pre-submit text capture detected",
      signalSource: "runtime_artifact_signal",
      sourceType: "signal",
      title: "Pre-submit text capture detected"
    });
  }

  const rejectAvailableOnFirstLayer =
    rejectPath?.rejectAvailableOnFirstLayer === true || rejectPath?.reject_available_on_first_layer === true;
  const choiceAsymmetry = String(rejectPath?.choiceAsymmetry ?? rejectPath?.choice_asymmetry ?? "unknown");
  const acceptClickDepth = getFiniteNumber(rejectPath?.acceptClickDepth ?? rejectPath?.accept_click_depth);
  const rejectClickDepth = getFiniteNumber(rejectPath?.rejectClickDepth ?? rejectPath?.reject_click_depth);
  const preferencesRequiredBeforeReject =
    rejectPath?.preferencesRequiredBeforeReject === true || rejectPath?.preferences_required_before_reject === true;
  const concreteRejectPathObserved =
    consentSurfaceObserved === true &&
    consentActionableChoiceObserved === true &&
    (acceptClickDepth !== null || rejectClickDepth !== null || preferencesRequiredBeforeReject);
  const consentSurfaceDiagnostics =
    getRuntimeObject(input.runtimeArtifacts, ["consentSurfaceDiagnostics", "consent_surface_diagnostics"]) ??
    getRuntimeObject(rejectPath, ["consentSurfaceDiagnostics", "consent_surface_diagnostics"]);
  const consentSurfaceGateEvidence = {
    consentActionableChoiceObserved,
    consentSurfaceDiagnostics,
    consentSurfaceObserved,
    rejectPathDepthAndAvailability: rejectPath,
    hybridConsentSummary: getRuntimeObject(input.runtimeArtifacts, ["hybridConsentSummary", "hybrid_consent_summary"]),
    hybridConsentVisual: getRuntimeObject(input.runtimeArtifacts, ["hybridConsentVisual", "hybrid_consent_visual"]),
    hybridUiSummary: getRuntimeObject(input.runtimeArtifacts, ["hybridUiSummary", "hybrid_ui_summary"])
  };
  const consentSurfaceGate = evaluateConsentSurfaceGate(consentSurfaceGateEvidence);
  if (
    rejectPath &&
    concreteRejectPathObserved &&
    !rejectAvailableOnFirstLayer &&
    (
      consentSurfaceGate.eligibleForConsentUxPromotion ||
      consentSurfaceGate.eligibleForRetainedRejectPathPromotion
    ) &&
    (choiceAsymmetry === "material" || choiceAsymmetry === "minor")
  ) {
    candidates.push({
      categoryId: "choice_symmetry_dark_pattern_indicators",
      description: "The retained consent interaction structure shows reject was not available on the first layer.",
      fallbackEvidence: {
        consentActionableChoiceObserved,
        consentSurfaceDecisionStates: consentSurfaceGate.states,
        consentSurfaceDiagnostics,
        consentSurfaceObserved,
        rejectPathDepthAndAvailability: rejectPath,
        reject_button_missing: choiceAsymmetry === "material",
        runtimeEvidenceArtifacts: ["scan_runtime_artifacts.reject_path_depth_and_availability"],
        signalKey: "privacy.dark_pattern_reject_button_missing",
        signalLabel: "Reject button missing",
        signalValue: true,
        snippets: [
          rejectClickDepth !== null && acceptClickDepth !== null
            ? `Reject required ${rejectClickDepth} interaction step(s), while accept required ${acceptClickDepth}.`
            : "Reject was not available on the first consent layer in the retained consent interaction structure."
        ],
        unifiedFindingId: "reject_button_missing"
      },
      id: "runtime-derived-signal-privacy.dark_pattern_reject_button_missing.evidence_quality",
      linkedValidationFinding: null,
      observedValue: choiceAsymmetry,
      severity: choiceAsymmetry === "material" ? "high" : "medium",
      signalKey: "privacy.dark_pattern_reject_button_missing",
      signalLabel: "Reject button missing",
      signalSource: "runtime_artifact_signal",
      sourceType: "signal",
      title: "Reject button missing"
    });

    candidates.push({
      categoryId: "choice_symmetry_dark_pattern_indicators",
      description: "The retained consent interaction structure shows accept was materially easier than reject.",
      fallbackEvidence: {
        accept_more_prominent_than_reject: true,
        asymmetric_consent_ui: true,
        consentActionableChoiceObserved,
        consentSurfaceDecisionStates: consentSurfaceGate.states,
        consentSurfaceDiagnostics,
        consentSurfaceObserved,
        rejectPathDepthAndAvailability: rejectPath,
        runtimeEvidenceArtifacts: ["scan_runtime_artifacts.reject_path_depth_and_availability"],
        signalKey: "privacy.dark_pattern_accept_button_prominence",
        signalLabel: "Accept action more prominent than reject",
        signalValue: true,
        snippets: [
          rejectClickDepth !== null && acceptClickDepth !== null
            ? `Accept required ${acceptClickDepth} interaction step(s), while reject required ${rejectClickDepth}.`
            : "Accept was available before an equivalent reject action in the retained consent interaction structure."
        ],
        unifiedFindingId: "accept_more_prominent_than_reject"
      },
      id: "runtime-derived-signal-privacy.dark_pattern_accept_button_prominence.evidence_quality",
      linkedValidationFinding: null,
      observedValue: choiceAsymmetry,
      severity: choiceAsymmetry === "material" ? "high" : "medium",
      signalKey: "privacy.dark_pattern_accept_button_prominence",
      signalLabel: "Accept action more prominent than reject",
      signalSource: "runtime_artifact_signal",
      sourceType: "signal",
      title: "Accept action more prominent than reject"
    });

    if (
      preferencesRequiredBeforeReject ||
      (
        acceptClickDepth !== null &&
        rejectClickDepth !== null &&
        rejectClickDepth > acceptClickDepth
      )
    ) {
      candidates.push({
        categoryId: "choice_symmetry_dark_pattern_indicators",
        description: "The retained consent interaction structure required additional interaction before reject was available.",
        fallbackEvidence: {
          consentActionableChoiceObserved,
          consentSurfaceDecisionStates: consentSurfaceGate.states,
          consentSurfaceDiagnostics,
          consentSurfaceObserved,
          forced_consent_wall: true,
          hybridConsentSummary: {
            ...(getRuntimeObject(input.runtimeArtifacts, ["hybridConsentSummary", "hybrid_consent_summary"]) ?? {}),
            bannerPresent: true,
            pageInteractionBlocked: true
          },
          hybridUiSummary: {
            ...(getRuntimeObject(input.runtimeArtifacts, ["hybridUiSummary", "hybrid_ui_summary"]) ?? {}),
            forcedActionRequired: true
          },
          overlayKind: "consent_modal",
          pageAccessBlockedUntilChoice: true,
          rejectPathDepthAndAvailability: rejectPath,
          runtimeEvidenceArtifacts: ["scan_runtime_artifacts.reject_path_depth_and_availability"],
          signalKey: "privacy.dark_pattern_forced_consent_wall",
          signalLabel: "Forced consent interaction",
          signalValue: true,
          snippets: [
            rejectClickDepth !== null && acceptClickDepth !== null
              ? `Reject required ${rejectClickDepth} interaction step(s), while accept required ${acceptClickDepth}.`
              : "Reject required a preferences or manage-choices path before the user could refuse."
          ],
          unifiedFindingId: "forced_consent_wall"
        },
        id: "runtime-derived-signal-privacy.dark_pattern_forced_consent_wall.evidence_quality",
        linkedValidationFinding: null,
        observedValue: preferencesRequiredBeforeReject ? "preferences_required_before_reject" : choiceAsymmetry,
        severity: "high",
        signalKey: "privacy.dark_pattern_forced_consent_wall",
        signalLabel: "Forced consent interaction",
        signalSource: "runtime_artifact_signal",
        sourceType: "signal",
        title: "Forced consent interaction"
      });
    }
  }

  const coverageImpact = String(botBlockChallengeEvidence?.coverageImpact ?? botBlockChallengeEvidence?.coverage_impact ?? "none");
  if (botBlockChallengeEvidence?.blocked === true && (coverageImpact === "material" || coverageImpact === "severe")) {
    candidates.push({
      categoryId: "manual_review_triggers",
      description: "Bot-management or challenge evidence limited scan coverage, so absence-style findings should be treated conservatively.",
      fallbackEvidence: {
        botBlockChallengeEvidence,
        coverageLimitationEvidence: getRuntimeObject(input.runtimeArtifacts, [
          "coverageLimitationEvidence",
          "coverage_limitation_evidence"
        ]),
        keyPageAttemptedUrls: getRuntimeStringArray(input.runtimeArtifacts, [
          "passivePublicVerificationAttemptedUrls",
          "passive_public_verification_attempted_urls"
        ]),
        signalKey: "disclosure.key_page_discovery_unresolved_after_bounded_search",
        signalLabel: "Bounded key-page discovery unresolved",
        signalValue: true,
        unifiedFindingId: "bounded_key_page_discovery_unresolved"
      },
      id: "runtime-derived-signal-disclosure.key_page_discovery_unresolved_after_bounded_search.evidence_quality",
      linkedValidationFinding: null,
      observedValue: coverageImpact,
      severity: coverageImpact === "severe" ? "high" : "medium",
      signalKey: "disclosure.key_page_discovery_unresolved_after_bounded_search",
      signalLabel: "Bounded key-page discovery unresolved",
      signalSource: "runtime_artifact_signal",
      sourceType: "signal",
      title: "Bounded key-page discovery unresolved"
    });
  }

  const cpraEvidence =
    input.runtimeArtifacts?.cpraCbaOptOutEvidence && typeof input.runtimeArtifacts.cpraCbaOptOutEvidence === "object"
      ? (input.runtimeArtifacts.cpraCbaOptOutEvidence as Record<string, unknown>)
      : input.runtimeArtifacts?.cpra_cba_opt_out_evidence && typeof input.runtimeArtifacts.cpra_cba_opt_out_evidence === "object"
        ? (input.runtimeArtifacts.cpra_cba_opt_out_evidence as Record<string, unknown>)
        : null;
  if (cpraEvidence && cpraEvidence.suppressorApplied === null) {
    const severity = cpraEvidence.findingSeverity === "critical" || cpraEvidence.findingSeverity === "high" ? "high" : "medium";
    candidates.push({
      categoryId: "rights_request_mechanisms",
      description:
        "Cross-context behavioral advertising vendors were observed during the homepage runtime scan, but a CPRA-specific opt-out mechanism was not confirmed in footer or persistent chrome.",
      fallbackEvidence: {
        ...cpraEvidence,
        signalKey: "privacy.cpra_cba_opt_out_missing",
        signalLabel: "CPRA CBA opt-out missing",
        signalValue: true,
        unifiedFindingId: "cpra_cba_opt_out_missing"
      },
      id: "runtime-derived-signal-privacy.cpra_cba_opt_out_missing",
      linkedValidationFinding: null,
      observedValue: typeof cpraEvidence.optOutUiResult === "string" ? cpraEvidence.optOutUiResult : null,
      severity,
      signalKey: "privacy.cpra_cba_opt_out_missing",
      signalLabel: "CPRA CBA opt-out missing",
      signalSource: "runtime_artifact_signal",
      sourceType: "signal",
      title: "CPRA CBA opt-out missing"
    });
  }

  const signalKey = "privacy.cross_domain_identifier_sharing_observed";
  const signalLabel = "Identifiers shared across domains";
  const signalValue = getHybridDerivedSignalValue(input.runtimeArtifacts, signalKey);

  if (signalValue !== true) {
    return candidates;
  }

  const fallbackEvidence = getHybridSignalFallbackEvidence({
    runtimeArtifacts: input.runtimeArtifacts,
    signalKey,
    signalLabel,
    signalValue
  });

  if (!fallbackEvidence) {
    return candidates;
  }

  const crossDomainIdentifierDestinations = uniqueStrings([
    ...(Array.isArray(fallbackEvidence.crossDomainIdentifierSharingDestinationEtlds)
      ? (fallbackEvidence.crossDomainIdentifierSharingDestinationEtlds as string[])
      : []),
    ...(Array.isArray(fallbackEvidence.cross_domain_identifier_sharing_destination_etlds)
      ? (fallbackEvidence.cross_domain_identifier_sharing_destination_etlds as string[])
      : [])
  ]);
  const crossDomainIdentifierDescription = crossDomainIdentifierDestinations.length >= 2
    ? "Identifier-like values were observed in requests to multiple external domains."
    : crossDomainIdentifierDestinations.length === 1
      ? "Identifier-like values were observed in a retained request to an external identity, RTB, or adtech destination."
      : "Identifier-like values were observed in retained requests to external identity, RTB, or adtech destinations.";

  candidates.push({
      categoryId: "adtech_analytics_replay_footprint",
      description: crossDomainIdentifierDescription,
      fallbackEvidence,
      id: `runtime-derived-signal-${signalKey}`,
      linkedValidationFinding: null,
      observedValue: signalLabel,
      severity: "high",
      signalKey,
      signalLabel,
      signalSource: "snapshot_signal",
      sourceType: "signal",
      title: signalLabel
    });

  return candidates;
}

export function buildScanReportUnifiedFindingState(
  scanRecord: ScanDetailResponse,
  dependencies: ScanReportUnifiedFindingStateDependencies
): ScanReportUnifiedFindingState {
  const snapshot = scanRecord.snapshot;
  if (!snapshot) {
    return {
      allReviewFindingCandidates: [],
      derivedContext: {
        accessibilityIssueRows: [],
        accessibilityRuleEvidenceRows: [],
        consentAuditFindings: [],
        policyBehaviorContradictions: [],
        preconsentViolationRows: [],
        prioritizedAccessibilityRuleRows: [],
        scanReportReviewIssues: [],
        taxonomySnapshotSections: []
      },
      globalUnifiedFindings: [],
      sectionDrafts: []
    };
  }

  const runtimeArtifacts = scanRecord.runtimeArtifacts;
  const policyEnrichmentById = new Map(scanRecord.policyEnrichment.map((row) => [String(row.id ?? ""), row]));
  const scanReportReviewIssues = scanRecord.policyReviewQueue.map((row, index) => {
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
  const preconsentViolationRows = dependencies.derivePreconsentViolationRows({
    persistedViolations: scanRecord.preconsentViolations,
    runtimeArtifacts,
    trackerVendors: scanRecord.trackerVendors
  });
  const policyBehaviorContradictions = dependencies.derivePolicyBehaviorContradictions({
    mergedSignals: scanRecord.mergedSignals,
    primaryPolicyEnrichment: scanRecord.primaryPolicyEnrichment,
    policyEnrichments: scanRecord.policyEnrichment,
    preconsentViolations: preconsentViolationRows,
    runtimeArtifacts,
    snapshot,
    trackerVendors: scanRecord.trackerVendors
  });
  const consentAuditFindings = dependencies.deriveConsentAuditFindings(snapshot, runtimeArtifacts);
  const accessibilityIssueRows = dependencies.deriveAccessibilityIssueRows(snapshot);
  const accessibilityRuleEvidenceRows = dependencies.deriveAccessibilityRuleEvidenceRows({
    examples: scanRecord.accessibilityRuleExamples ?? [],
    ruleCounts: scanRecord.accessibilityRuleCounts ?? []
  });
  const prioritizedAccessibilityRuleRows = [...accessibilityRuleEvidenceRows]
    .sort((left, right) => right.weightedPriority - left.weightedPriority)
    .slice(0, 6);
  const taxonomySnapshotSections = groupSnapshotFieldsByPrimaryCategory(Object.keys(snapshot)).map((group) => ({
    title: group.category.label,
    description: group.category.description,
    fields: group.entries.map((entry) => entry.key)
  }));
  const validationFindingLookup = buildValidationFindingLookup(scanRecord.validationFindings);
  const sectionDrafts = REPORT_PRIMARY_PILLARS.map((pillar) => {
    const sections = getReportSectionsForPillar(pillar.id).map((section) => {
      const sectionCategoryIds = new Set(getReportEvidenceCategoriesForSection(section.id).map((category) => category.id));
      const categories = getReportEvidenceCategoriesForSection(section.id).map((category) => {
        const items = getReportSignalsForEvidenceCategory(category.id)
          .map(({ relation, signal }) => ({
            key: signal.key,
            label: signal.label,
            relation,
            source: signal.source,
            value: getReportSignalValue({
              mergedSignals: scanRecord.mergedSignals,
              policyEnrichment: scanRecord.policyEnrichment,
              runtimeArtifacts: scanRecord.runtimeArtifacts,
              signals: scanRecord.signals,
              snapshot: scanRecord.snapshot,
              signal
            })
          }))
          .filter((item) => isSignalValuePopulated(item.key, item.value))
          .sort((left, right) => {
            const relationOrder = { primary: 0, secondary: 1, overlay: 2 } as const;
            return relationOrder[left.relation] - relationOrder[right.relation] || left.label.localeCompare(right.label);
          });

        const reviewFindings = buildReviewFindings({
          allSignals: scanRecord.signals,
          categoryId: category.id,
          issues: [],
          macroEnrichment: scanRecord.macroEnrichment,
          mergedSignals: scanRecord.mergedSignals,
          policyEnrichment: scanRecord.policyEnrichment,
          prioritizedAccessibilityRuleRows,
          runtimeArtifacts: scanRecord.runtimeArtifacts,
          signalHitRows: scanRecord.signalHits,
          snapshot,
          sectionId: section.id,
          sectionItems: items,
          trackerVendors: scanRecord.trackerVendors,
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
        accessibilityIssueRows,
        consentAuditFindings,
        pageEvidenceRows: scanRecord.pageEvidence,
        policyBehaviorContradictions,
        preconsentViolationRows,
        runtimeArtifacts,
        scanReportReviewIssues,
        sectionId: section.id,
        signalHitRows: scanRecord.signalHits,
        snapshot
      });
      const issueFindings = buildReviewFindings({
        allSignals: scanRecord.signals,
        issues,
        macroEnrichment: scanRecord.macroEnrichment,
        mergedSignals: scanRecord.mergedSignals,
        policyEnrichment: scanRecord.policyEnrichment,
        prioritizedAccessibilityRuleRows,
        runtimeArtifacts: scanRecord.runtimeArtifacts,
        signalHitRows: scanRecord.signalHits,
        snapshot,
        sectionId: section.id,
        sectionItems: [],
        trackerVendors: scanRecord.trackerVendors,
        validationFindingLookup
      });

      return {
        categories,
        issueFindings,
        pillar,
        section,
        sectionCategoryIds
      };
    });

    return { pillar, sections };
  });

  const allReviewFindingCandidates = sectionDrafts.flatMap(({ sections }) =>
    sections.flatMap((section) => [
      ...section.categories.flatMap((category) => category.reviewFindings),
      ...section.issueFindings
    ])
  );
  const runtimeDerivedReviewFindingCandidates = buildRuntimeDerivedReviewFindingCandidates({
    runtimeArtifacts
  }).filter(
    (candidate) =>
      !allReviewFindingCandidates.some(
        (existing) =>
          existing.signalKey === candidate.signalKey ||
          existing.fallbackEvidence?.signalKey === candidate.signalKey
      )
  );
  const globalUnifiedFindings = dependencies.filterContradictoryPositiveSurfaceFindings(buildUnifiedFindingDisplayPackets({
    coverageSummary: {
      legalCoverageScore: getFiniteNumber(scanRecord.snapshot?.legal_coverage_score),
      pagesScanned: getFiniteNumber(scanRecord.snapshot?.pages_scanned),
      policyEnrichmentCount: scanRecord.policyEnrichment.length,
      verifiedPublicSurfacesCount: getFiniteNumber(scanRecord.snapshot?.verified_public_surfaces_count)
    },
    macroEnrichment: scanRecord.macroEnrichment,
    mergedSignals: scanRecord.mergedSignals,
    policyEnrichment: scanRecord.policyEnrichment,
    reviewFindingCandidates: [...allReviewFindingCandidates, ...runtimeDerivedReviewFindingCandidates],
    scanEvents: scanRecord.events,
    validationFindings: scanRecord.validationFindings,
    validationFindingLookup
  }).filter((finding) => finding.presentationDecision.status !== "suppress"));

  return {
    allReviewFindingCandidates,
    derivedContext: {
      accessibilityIssueRows,
      accessibilityRuleEvidenceRows,
      consentAuditFindings,
      policyBehaviorContradictions,
      preconsentViolationRows,
      prioritizedAccessibilityRuleRows,
      scanReportReviewIssues,
      taxonomySnapshotSections
    },
    globalUnifiedFindings,
    sectionDrafts
  };
}

export function selectOwnerUnifiedFindingsForSection(
  findings: UnifiedFindingDisplayPacket[],
  sectionCategoryIds: Set<string>
) {
  const reviewFindings = findings.filter((finding) =>
    finding.categoryAlignments.some((alignment) => sectionCategoryIds.has(alignment.evidenceCategoryId))
  );

  return reviewFindings.filter((finding) => {
    const ownerCategoryId = finding.categoryAlignments.find((alignment) => alignment.relation === "owner")?.evidenceCategoryId;
    return ownerCategoryId ? sectionCategoryIds.has(ownerCategoryId) : false;
  });
}

export function selectOwnerUnifiedFindings(state: ScanReportUnifiedFindingState) {
  return [
    ...new Map(
      state.sectionDrafts
        .flatMap(({ sections }) =>
          sections.flatMap((section) =>
            selectOwnerUnifiedFindingsForSection(state.globalUnifiedFindings, section.sectionCategoryIds)
          )
        )
        .map((finding) => [finding.unifiedFindingId, finding])
    ).values()
  ];
}

export function buildScanReportUnifiedFindings(state: ScanReportUnifiedFindingState) {
  return selectOwnerUnifiedFindings(state);
}

function normalizeFindingTopicText(value: string | null | undefined) {
  return typeof value === "string" ? value.trim().toLowerCase().replace(/\s+/g, " ") : "";
}

function getPositiveSurfaceTopicKey(finding: Pick<UnifiedFindingDisplayPacket, "title" | "unifiedFindingId">) {
  switch (finding.unifiedFindingId) {
    case "privacy_contact_path_present":
      return "privacy_contact_path";
    case "accessibility_support_path_present":
      return "accessibility_support_path";
    case "privacy_policy_present":
      return "privacy_policy";
    case "terms_of_service_present":
      return "terms_of_service";
    case "cookie_policy_present":
      return "cookie_policy";
    default:
      break;
  }

  const normalizedTitle = normalizeFindingTopicText(finding.title);
  if (normalizedTitle === "privacy contact path present") {
    return "privacy_contact_path";
  }
  if (normalizedTitle === "accessibility support path present") {
    return "accessibility_support_path";
  }
  if (normalizedTitle === "privacy policy present") {
    return "privacy_policy";
  }
  if (normalizedTitle === "terms of service present") {
    return "terms_of_service";
  }
  if (normalizedTitle === "cookie policy present") {
    return "cookie_policy";
  }

  return null;
}

function getContradictoryPositiveTopicKey(finding: Pick<UnifiedFindingDisplayPacket, "title" | "unifiedFindingId">) {
  switch (finding.unifiedFindingId) {
    case "privacy_contact_channel_missing":
      return "privacy_contact_path";
    case "accessibility_support_path_missing":
      return "accessibility_support_path";
    case "privacy_policy_missing_surface":
      return "privacy_policy";
    case "terms_missing_surface":
      return "terms_of_service";
    case "cookie_policy_missing_surface":
      return "cookie_policy";
    default:
      break;
  }

  const normalizedTitle = normalizeFindingTopicText(finding.title);
  if (normalizedTitle === "privacy contact path missing") {
    return "privacy_contact_path";
  }
  if (normalizedTitle === "accessibility support path missing") {
    return "accessibility_support_path";
  }
  if (normalizedTitle === "privacy policy missing") {
    return "privacy_policy";
  }
  if (normalizedTitle === "terms missing") {
    return "terms_of_service";
  }
  if (normalizedTitle === "cookie policy missing") {
    return "cookie_policy";
  }

  return null;
}

export function filterContradictoryPositiveSurfaceFindings(findings: UnifiedFindingDisplayPacket[]) {
  const contradictoryPositiveFindingIdByNegative = new Map<string, string>([
    ["privacy_contact_channel_missing", "privacy_contact_path_present"],
    ["accessibility_support_path_missing", "accessibility_support_path_present"],
    ["privacy_policy_missing_surface", "privacy_policy_present"],
    ["terms_missing_surface", "terms_of_service_present"],
    ["cookie_policy_missing_surface", "cookie_policy_present"]
  ]);
  const presentFindingIds = new Set(findings.map((finding) => finding.unifiedFindingId));
  const normalizedPositiveTopicKeys = new Set(
    findings.flatMap((finding) => {
      const topicKey = getPositiveSurfaceTopicKey(finding);
      return topicKey ? [topicKey] : [];
    })
  );

  return findings.filter((finding) => {
    const contradictoryPositiveFindingId = contradictoryPositiveFindingIdByNegative.get(finding.unifiedFindingId);
    if (contradictoryPositiveFindingId && presentFindingIds.has(contradictoryPositiveFindingId)) {
      return false;
    }

    const contradictoryPositiveTopicKey = getContradictoryPositiveTopicKey(finding);
    return !contradictoryPositiveTopicKey || !normalizedPositiveTopicKeys.has(contradictoryPositiveTopicKey);
  });
}

export function debugBuildScanReportUnifiedFindingStateForScan(scanRecord: Record<string, unknown>): ScanReportUnifiedFindingState {
  const snapshot = scanRecord.snapshot;
  if (!snapshot) {
    return {
      allReviewFindingCandidates: [],
      derivedContext: {
        accessibilityIssueRows: [],
        accessibilityRuleEvidenceRows: [],
        consentAuditFindings: [],
        policyBehaviorContradictions: [],
        preconsentViolationRows: [],
        prioritizedAccessibilityRuleRows: [],
        scanReportReviewIssues: [],
        taxonomySnapshotSections: []
      },
      globalUnifiedFindings: [],
      sectionDrafts: []
    };
  }

  try {
    return buildScanReportUnifiedFindingState(scanRecord as ScanDetailResponse, {
      deriveAccessibilityIssueRows,
      deriveAccessibilityRuleEvidenceRows,
      deriveConsentAuditFindings: (candidateSnapshot, runtimeArtifacts) =>
        dedupeHeadlineFindings(deriveConsentAuditFindings(candidateSnapshot, runtimeArtifacts)),
      derivePolicyBehaviorContradictions: (input) =>
        derivePolicyBehaviorContradictions(input as Parameters<typeof derivePolicyBehaviorContradictions>[0]),
      derivePreconsentViolationRows,
      filterContradictoryPositiveSurfaceFindings
    });
  } catch (error) {
    console.error("Failed to build scan report unified finding state", error);
    return {
      allReviewFindingCandidates: [],
      derivedContext: {
        accessibilityIssueRows: [],
        accessibilityRuleEvidenceRows: [],
        consentAuditFindings: [],
        policyBehaviorContradictions: [],
        preconsentViolationRows: [],
        prioritizedAccessibilityRuleRows: [],
        scanReportReviewIssues: [],
        taxonomySnapshotSections: []
      },
      globalUnifiedFindings: [],
      sectionDrafts: []
    };
  }
}

export function buildScanReportUnifiedFindingsForScan(scanRecord: Record<string, unknown>) {
  const snapshot = scanRecord.snapshot;
  if (!snapshot) {
    return [] as UnifiedFindingDisplayPacket[];
  }

  try {
    const state = debugBuildScanReportUnifiedFindingStateForScan(scanRecord);
    const ownerFindings = buildScanReportUnifiedFindings(state);

    return filterContradictoryPositiveSurfaceFindings(ownerFindings);
  } catch (error) {
    console.error("Failed to build scan report unified findings", error);
    return [] as UnifiedFindingDisplayPacket[];
  }
}
