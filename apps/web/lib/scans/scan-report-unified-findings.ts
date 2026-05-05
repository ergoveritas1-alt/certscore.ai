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
  buildPreconsentEvidenceQualityFallback,
  getHybridDerivedSignalValue,
  getHybridSignalFallbackEvidence
} from "./hybrid-runtime-evidence";
import { REJECT_TRACKING_CONFIRMATION_MIN_MS } from "./reject-tracking-policy";
import { getReportSignalValue, isSignalValuePopulated } from "./report-signal-values";
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

function getFiniteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
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

  if (nonEssentialRequestRows.length > 0 && firstNonEssentialRequestMs !== null) {
    candidates.push({
      categoryId: "preconsent_tracking_incidents",
      description: hasPreconsentSequence
        ? "A retained consent timeline places a non-essential request before the CMP was visible or before a consent action."
        : "A retained non-essential request classification exists, but the timing sequence is incomplete or ambiguous.",
      fallbackEvidence: {
        consentTimeline,
        consentActionableChoiceObserved,
        consentSurfaceObserved,
        requestPurposeClassificationConfidence: requestClassifications,
        preconsent_tracker_evidence_urls: nonEssentialRequestRows.map((row) => String(row.requestUrl)),
        preconsent_tracker_vendors: nonEssentialRequestRows
          .map((row) => (typeof row.vendor === "string" ? row.vendor : null))
          .filter((value): value is string => Boolean(value)),
        signalKey: "privacy.preconsent_tracking_detected",
        signalLabel: "Pre-consent tracking detected",
        signalValue: true,
        ...(preconsentEvidenceQuality ?? {})
      },
      id: "runtime-derived-signal-privacy.preconsent_tracking_detected.evidence_quality",
      linkedValidationFinding: null,
      observedValue: `${nonEssentialRequestRows.length} classified non-essential request(s)`,
      severity: hasPreconsentSequence ? "high" : "medium",
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
        /^(advertising|analytics|session_replay|marketing_automation)$/i.test(category) &&
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
  if (rejectPath && !rejectAvailableOnFirstLayer && (choiceAsymmetry === "material" || choiceAsymmetry === "minor")) {
    candidates.push({
      categoryId: "choice_symmetry_dark_pattern_indicators",
      description: "The retained consent interaction structure shows reject was not available on the first layer.",
      fallbackEvidence: {
        rejectPathDepthAndAvailability: rejectPath,
        reject_button_missing: choiceAsymmetry === "material",
        signalKey: "privacy.dark_pattern_reject_button_missing",
        signalLabel: "Reject button missing",
        signalValue: true
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

  candidates.push({
      categoryId: "adtech_analytics_replay_footprint",
      description: "Identifier-like values were observed in requests to multiple external domains.",
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
