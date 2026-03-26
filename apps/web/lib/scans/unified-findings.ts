import {
  getReportUnifiedFinding,
  getReportUnifiedFindingByAlias,
  getReportUnifiedFindingForSignal,
  getReportUnifiedFindingForValidationRule,
  type ReportSignalSource,
  type ReportUnifiedFindingCategoryAlignment
} from "@website-signal-risk-scanner/shared";
import {
  buildCanonicalReviewFindingPresentation,
  normalizeFindingName,
  type CanonicalReviewFindingPresentation,
  type ReviewFindingSeverity
} from "./canonical-review-finding";
import {
  isDomainLevelChildrenDisclosureFinding,
  isDomainLevelSensitiveContextFinding,
  packetNeedsPageAttribution
} from "./concern-policy";
import {
  buildNormalizedConcerns,
  buildUnifiedFindingCandidatesFromConcerns,
  type NormalizedConcernAssertionLevel,
  type ConcernBackedUnifiedFindingCandidate,
  type NormalizedConcernEvidenceStrengthFlag,
  type NormalizedConcernExternalSurfacingEligibility,
  type NormalizedConcernNegativeEvidenceFlag,
  type NormalizedConcernOriginType,
  type NormalizedConcernPromotionEligibility
} from "./normalized-concerns";
import {
  findValidationFindingForKeys,
  type ScanValidationFinding
} from "./validation-review-linking";
import {
  getPolicyPositiveSignalKeysForFinding
} from "./policy-positive-signal-contract";
import {
  getContradictionEvidenceBundle
} from "./contradiction-evidence-contract";
import {
  isMeaningfulPolicyText,
  normalizePolicySnippet
} from "./policy-snippet-normalization";
import {
  evaluateFinancialJudgeInput,
  getFinancialValidationSpec,
  getFinancialValidationEvidenceBundle,
  isFinancialValidationFindingId
} from "./financial-validation-contract";
import { getStoredFinancialJudgeOutput } from "./financial-judge-contract";

export type UnifiedFindingDetails =
  | {
      family: "coverage_gap";
      gapKind: "surface_missing" | "fetch_failed" | "bounded_discovery_unresolved";
      pageType: string;
      attemptCount?: number | null;
      attemptedUrls?: string[];
      bestDiscoverySource?: string | null;
      guessedOnly?: boolean | null;
      stopReason?: string | null;
    }
  | {
      family: "policy_extraction";
      kind: string;
      pageType?: string;
      confidence?: number | null;
      ambiguityScore?: number | null;
    }
  | {
      family: "rights_gap";
      kind: string;
      frictionScore?: number | null;
      unmatchedItems?: string[];
    }
  | {
      family: "contradiction";
      kind: string;
      claim?: string | null;
      observedBehavior?: string | null;
      policySourceUrl?: string | null;
      runtimeEvidenceArtifacts?: string[];
      vendors?: string[];
    }
  | {
      family: "consent_tracking";
      kind: string;
      vendors?: string[];
      requestUrls?: string[];
    }
  | {
      family: "sensitive_data";
      kind: string;
      dataTypes?: string[];
    }
  | {
      family: "commercial";
      kind: string;
    }
  | {
      family: "accessibility";
      kind: string;
      ruleExamples?: string[];
    };

export type UnifiedFindingPacket = {
  unifiedFindingId: string;
  title: string;
  severity: ReviewFindingSeverity;
  summary: string;
  confidenceBand: "high" | "moderate" | "low";
  primaryPageUrl: string | null;
  affectedPageCount: number;
  confidenceInputs: {
    evidenceQualityFlags: string[];
    hasConcretePayloadEvidence: boolean;
    hasDirectRuntimeEvidence: boolean;
    hasKeyPageDiscoveryEvidence: boolean;
    hasPageAttribution: boolean;
    hasPolicyTextEvidence: boolean;
    hasStructuredValidationEvidence: boolean;
    isFallbackOnly: boolean;
    issueCount: number;
    signalCount: number;
    sourceCount: number;
    sourceKinds: Array<"issue" | "signal" | "validation">;
    validationCount: number;
  };
  categoryAlignments: ReportUnifiedFindingCategoryAlignment[];
  sourceRefs: Array<
    | { kind: "signal"; key: string; label?: string; source: ReportSignalSource }
    | { kind: "validation"; ruleKey: string; title?: string }
    | { kind: "issue"; title: string }
  >;
  evidence?: {
    counts?: Record<string, number>;
    entities?: Record<string, string[]>;
    flags?: string[];
    pageUrls?: string[];
    snippets?: string[];
    sourceUrls?: string[];
  };
  details?: UnifiedFindingDetails;
  concernContext?: {
    assertionLevels: NormalizedConcernAssertionLevel[];
    evidenceStrengthFlags: NormalizedConcernEvidenceStrengthFlag[];
    externalSurfacingEligibilities: NormalizedConcernExternalSurfacingEligibility[];
    negativeEvidenceFlags: NormalizedConcernNegativeEvidenceFlag[];
    originTypes: NormalizedConcernOriginType[];
    promotionEligibilities: NormalizedConcernPromotionEligibility[];
  };
};

export type UnifiedFindingPresentationDecision = {
  confidenceRationale: string;
  rationale: string;
  status: "surface" | "audit_only" | "suppress";
};

export type UnifiedFindingCandidate = {
  categoryId?: string;
  description: string;
  evidence?: string[];
  fallbackEvidence?: Record<string, unknown>;
  linkedValidationFinding?: ScanValidationFinding | null;
  observedValue: string | null;
  severity: ReviewFindingSeverity;
  sourceType: "issue" | "signal";
  signalKey?: string;
  signalLabel?: string;
  signalSource?: ReportSignalSource;
  title: string;
};

type UnifiedFindingScanEvent = {
  eventType: string;
  metadataJson?: unknown;
};

type FamilyPacketTargetRecord = {
  canonicalUrl?: unknown;
  snippet?: unknown;
  sourceSurfaceTypes?: unknown;
  supportedSurfaceTypes?: unknown;
  supportingRefs?: unknown;
  title?: unknown;
};

type FamilyPacketFindingRecord = {
  evidenceUrls?: unknown;
  findingId?: unknown;
  reason?: unknown;
  sourceSurfaceTypes?: unknown;
};

type FindingFamilyPacketRecord = {
  canonicalTargets?: unknown;
  familyId?: unknown;
  supportedUnifiedFindings?: unknown;
};

export type UnifiedFindingDisplayPacket = UnifiedFindingPacket & {
  linkedValidationFinding: ScanValidationFinding | null;
  observedValue: string | null;
  presentationDecision: UnifiedFindingPresentationDecision;
  presentation: CanonicalReviewFindingPresentation;
  referenceLabel?: string;
  referenceUrl?: string;
  sourceLabel?: string;
  sourceUrl?: string;
};

const COVERAGE_FINDING_IDS = new Set([
  "privacy_policy_missing_surface",
  "privacy_policy_unavailable",
  "terms_missing_surface",
  "terms_unavailable",
  "cookie_policy_missing_surface",
  "cookie_policy_unavailable",
  "accessibility_statement_missing_surface",
  "accessibility_statement_unavailable",
  "contact_page_missing_surface",
  "contact_page_unavailable",
  "bounded_key_page_discovery_unresolved"
]);

const POLICY_EXTRACTION_FINDING_IDS = new Set([
  "low_confidence_policy_extraction",
  "policy_extraction_provider_error",
  "disclosure_likely_obstructed",
  "cookie_policy_structurally_obstructed",
  "policy_clarity_risk",
  "rule_only_policy_row_present"
]);

const RIGHTS_GAP_FINDING_IDS = new Set([
  "privacy_contact_channel_missing",
  "sale_sharing_controls_missing",
  "missing_dsar_mechanism",
  "missing_dsar_high_exposure",
  "rights_fulfillment_friction",
  "cookie_disclosure_gap",
  "missing_retention_disclosure",
  "missing_transfer_disclosure"
]);

const CONTRADICTION_FINDING_IDS = new Set([
  "policy_behavior_conflict",
  "consent_gated_tracking_claim_conflict",
  "do_not_sell_sharing_disclosure_conflict",
  "privacy_terms_conflict",
  "privacy_cookie_policy_conflict",
  "functional_misalignment",
  "session_replay_undisclosed",
  "missing_technical_disclosure"
]);

const CONSENT_TRACKING_FINDING_IDS = new Set([
  "preconsent_tracking",
  "consent_mechanism_absent",
  "consent_surface_missing",
  "reject_did_not_reduce_tracking",
  "reject_did_not_reduce_third_party_cookies",
  "gpc_signal_not_honored",
  "weak_cookie_security_attributes",
  "consent_surface_required_deeper_sweep",
  "accept_flow_unavailable_after_reject",
  "reject_button_missing",
  "accept_more_prominent_than_reject",
  "forced_consent_wall",
  "accept_only_banner",
  "dismiss_without_reject",
  "session_replay_observed",
  "retargeting_pixel_observed"
]);

const SENSITIVE_DATA_FINDING_IDS = new Set([
  "high_sensitivity_data_collection",
  "health_information_collection",
  "geolocation_collection",
  "ssn_collection",
  "government_id_collection",
  "financial_information_collection",
  "minors_or_age_gated_collection_context",
  "children_privacy_context_without_supporting_disclosure"
]);

const COMMERCIAL_FINDING_IDS = new Set([
  "discount_claim_present",
  "original_price_comparison_present",
  "limited_time_pressure",
  "store_credit_only_remedy",
  "restrictive_termination_or_suspension_terms"
]);

const SPECIFIC_CONTRADICTION_FINDING_IDS = new Set([
  "consent_gated_tracking_claim_conflict",
  "do_not_sell_sharing_disclosure_conflict",
  "privacy_terms_conflict",
  "privacy_cookie_policy_conflict",
  "functional_misalignment",
  "session_replay_undisclosed",
  "missing_technical_disclosure"
]);

function uniqueStrings(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => typeof value === "string" && value.trim().length > 0))];
}

function uniqueConcernFlags<T extends string>(values: T[]) {
  return [...new Set(values)];
}

function isRawMarkerToken(value: string) {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return false;
  }

  return /^[a-z]+(?:_[a-z0-9]+)+$/i.test(trimmed) && !/\s/.test(trimmed);
}

function isReviewerFacingSnippet(value: string) {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return false;
  }

  const looksLikeJsonBlob =
    (/^\s*[\[{]/.test(trimmed) && /"\w+"\s*:/.test(trimmed)) ||
    /"schemaType"\s*:|"schemaVersion"\s*:|"notices"\s*:|"content"\s*:/i.test(trimmed);

  if (looksLikeJsonBlob) {
    return false;
  }

  return !isRawMarkerToken(trimmed);
}

function getSeverityWeight(severity: ReviewFindingSeverity | null | undefined) {
  if (severity === "high") {
    return 3;
  }
  if (severity === "medium") {
    return 2;
  }
  return 1;
}

function maxSeverity(left: ReviewFindingSeverity, right: ReviewFindingSeverity): ReviewFindingSeverity {
  return getSeverityWeight(left) >= getSeverityWeight(right) ? left : right;
}

function getBestObservedValue(values: Array<string | null | undefined>) {
  return values.find((value): value is string => typeof value === "string" && value.trim().length > 0) ?? null;
}

function getFindingFamily(id: string): UnifiedFindingDetails["family"] {
  if (COVERAGE_FINDING_IDS.has(id)) {
    return "coverage_gap";
  }
  if (POLICY_EXTRACTION_FINDING_IDS.has(id)) {
    return "policy_extraction";
  }
  if (RIGHTS_GAP_FINDING_IDS.has(id)) {
    return "rights_gap";
  }
  if (CONTRADICTION_FINDING_IDS.has(id)) {
    return "contradiction";
  }
  if (CONSENT_TRACKING_FINDING_IDS.has(id)) {
    return "consent_tracking";
  }
  if (SENSITIVE_DATA_FINDING_IDS.has(id)) {
    return "sensitive_data";
  }
  if (COMMERCIAL_FINDING_IDS.has(id)) {
    return "commercial";
  }
  return "accessibility";
}

function getCoveragePageType(id: string) {
  if (id.startsWith("privacy_policy_")) {
    return "privacy_policy";
  }
  if (id.startsWith("terms_")) {
    return "terms_of_service";
  }
  if (id.startsWith("cookie_policy_")) {
    return "cookie_policy";
  }
  if (id.startsWith("accessibility_statement_")) {
    return "accessibility_statement";
  }
  if (id.startsWith("contact_page_")) {
    return "contact_page";
  }
  return "unknown";
}

function hasConfirmedLinkedDiscoverySource(source: string | null | undefined) {
  return ["footer_link", "header_link", "body_link", "legal_hub"].includes(source ?? "");
}

function buildUnifiedFindingDetails(input: {
  fallbackEvidence?: Record<string, unknown> | null;
  findingId: string;
  linkedValidationFinding?: ScanValidationFinding | null;
  observedValue: string | null;
  summary: string;
}) {
  const family = getFindingFamily(input.findingId);

  if (family === "coverage_gap") {
    return {
      family,
      gapKind: input.findingId.endsWith("_unavailable")
        ? "fetch_failed"
        : input.findingId === "bounded_key_page_discovery_unresolved"
          ? "bounded_discovery_unresolved"
          : "surface_missing",
      pageType: getCoveragePageType(input.findingId),
      attemptCount:
        typeof input.fallbackEvidence?.keyPageAttemptCount === "number" ? input.fallbackEvidence.keyPageAttemptCount : null,
      attemptedUrls: Array.isArray(input.fallbackEvidence?.keyPageAttemptedUrls)
        ? input.fallbackEvidence.keyPageAttemptedUrls.filter((value): value is string => typeof value === "string")
        : [],
      bestDiscoverySource:
        typeof input.fallbackEvidence?.keyPageDiscoverySource === "string"
          ? input.fallbackEvidence.keyPageDiscoverySource
          : null,
      guessedOnly:
        typeof input.fallbackEvidence?.keyPageGuessedOnly === "boolean" ? input.fallbackEvidence.keyPageGuessedOnly : null,
      stopReason: typeof input.fallbackEvidence?.keyPageStopReason === "string" ? input.fallbackEvidence.keyPageStopReason : null
    } satisfies UnifiedFindingDetails;
  }

  if (family === "policy_extraction") {
    return {
      family,
      kind: input.findingId,
      confidence:
        typeof input.linkedValidationFinding?.systemConfidenceScore === "number"
          ? input.linkedValidationFinding.systemConfidenceScore
          : typeof input.fallbackEvidence?.signalValue === "number"
            ? input.fallbackEvidence.signalValue
            : null,
      ambiguityScore:
        typeof input.fallbackEvidence?.signalValue === "number" && input.findingId === "policy_clarity_risk"
          ? input.fallbackEvidence.signalValue
          : null
    } satisfies UnifiedFindingDetails;
  }

  if (family === "rights_gap") {
    return {
      family,
      kind: input.findingId,
      frictionScore:
        typeof input.fallbackEvidence?.consentFrictionDelta === "number"
          ? input.fallbackEvidence.consentFrictionDelta
          : typeof input.fallbackEvidence?.signalValue === "number"
            ? input.fallbackEvidence.signalValue
            : null,
      unmatchedItems: Array.isArray(input.linkedValidationFinding?.evidence?.unmatchedCookieNames)
        ? (input.linkedValidationFinding?.evidence?.unmatchedCookieNames as string[])
        : []
    } satisfies UnifiedFindingDetails;
  }

  if (family === "contradiction") {
    const contradictionEvidence =
      getContradictionEvidenceBundle(input.linkedValidationFinding?.evidence as Record<string, unknown> | null | undefined) ??
      getContradictionEvidenceBundle(input.fallbackEvidence);
    const vendors = uniqueStrings([
      ...(contradictionEvidence?.runtimeVendors ?? []),
      ...(contradictionEvidence?.relatedVendors ?? [])
    ]);

    return {
      family,
      kind: input.findingId,
      claim: contradictionEvidence?.claim ?? null,
      observedBehavior: contradictionEvidence?.runtimeSummary ?? input.summary,
      policySourceUrl: contradictionEvidence?.policySourceUrl ?? null,
      runtimeEvidenceArtifacts: contradictionEvidence?.runtimeEvidenceArtifacts ?? [],
      vendors
    } satisfies UnifiedFindingDetails;
  }

  if (family === "consent_tracking") {
    const vendors = uniqueStrings([
      ...(Array.isArray(input.linkedValidationFinding?.evidence?.preconsent_tracker_vendors)
        ? (input.linkedValidationFinding?.evidence?.preconsent_tracker_vendors as string[])
        : []),
      ...(Array.isArray(input.linkedValidationFinding?.evidence?.persisted_tracker_vendors)
        ? (input.linkedValidationFinding?.evidence?.persisted_tracker_vendors as string[])
        : [])
    ]);

    return {
      family,
      kind: input.findingId,
      vendors,
      requestUrls: uniqueStrings([
        ...(Array.isArray(input.linkedValidationFinding?.evidence?.preconsent_tracker_evidence_urls)
          ? (input.linkedValidationFinding?.evidence?.preconsent_tracker_evidence_urls as string[])
          : [])
      ])
    } satisfies UnifiedFindingDetails;
  }

  if (family === "sensitive_data") {
    const derivedDataTypes = uniqueStrings([
      ...(Array.isArray(input.fallbackEvidence?.sensitivePayloadViolations)
        ? (input.fallbackEvidence?.sensitivePayloadViolations as Array<Record<string, unknown>>).map((row) =>
            typeof row.detectedType === "string" ? row.detectedType : null
          )
        : []),
      input.fallbackEvidence?.formCollectsBirthdate === true || input.fallbackEvidence?.dateOfBirthInputPresent === true
        ? "birthdate"
        : null,
      input.fallbackEvidence?.childrenAudienceLikely === true || input.fallbackEvidence?.kidDirectedContentDetected === true
        ? "youth_directed_context"
        : null,
      input.fallbackEvidence?.mentionsCoppa === true ||
      input.fallbackEvidence?.mentionsUnder13 === true ||
      input.fallbackEvidence?.mentionsUnder16 === true
        ? "children_privacy_context"
        : null
    ]);

    return {
      family,
      kind: input.findingId,
      dataTypes: derivedDataTypes
    } satisfies UnifiedFindingDetails;
  }

  if (family === "commercial") {
    return { family, kind: input.findingId } satisfies UnifiedFindingDetails;
  }

  if (family === "accessibility") {
    return {
      family,
      kind: input.findingId,
      ruleExamples: uniqueStrings(
        Array.isArray(input.fallbackEvidence?.accessibilityRuleExamples)
          ? (input.fallbackEvidence?.accessibilityRuleExamples as Array<Record<string, unknown>>).map((row) =>
              typeof row.ruleCode === "string" ? row.ruleCode : null
            )
          : []
      )
    } satisfies UnifiedFindingDetails;
  }

  return undefined;
}

function extractEvidenceFromFallback(fallbackEvidence?: Record<string, unknown> | null) {
  if (!fallbackEvidence) {
    return {
      counts: {} as Record<string, number>,
      entities: {} as Record<string, string[]>,
      flags: [] as string[],
      pageUrls: [] as string[],
      snippets: [] as string[],
      sourceUrls: [] as string[]
    };
  }

  const contradictionEvidence = getContradictionEvidenceBundle(fallbackEvidence);
  const pageUrls = uniqueStrings([
    ...(Array.isArray(fallbackEvidence.pageUrls) ? (fallbackEvidence.pageUrls as string[]) : []),
    ...(contradictionEvidence?.policySourceUrl ? [contradictionEvidence.policySourceUrl] : []),
    typeof fallbackEvidence.pageUrl === "string" ? fallbackEvidence.pageUrl : null,
    typeof fallbackEvidence.consentBlockerUrl === "string" ? fallbackEvidence.consentBlockerUrl : null
  ]);

  const sourceUrls = uniqueStrings([
    ...(Array.isArray(fallbackEvidence.sourceUrls) ? (fallbackEvidence.sourceUrls as string[]) : []),
    ...(contradictionEvidence?.sourceUrls ?? []),
    typeof fallbackEvidence.sourceUrl === "string" ? fallbackEvidence.sourceUrl : null,
    typeof fallbackEvidence.pageUrl === "string" ? fallbackEvidence.pageUrl : null
  ]);

  const snippets = uniqueStrings([
    isMeaningfulPolicyText(fallbackEvidence.consentBlockerTextSnippet) ? fallbackEvidence.consentBlockerTextSnippet : null,
    isMeaningfulPolicyText(fallbackEvidence.policyChildrenReference) ? fallbackEvidence.policyChildrenReference : null,
    contradictionEvidence?.claim,
    contradictionEvidence?.policySnippet,
    contradictionEvidence?.runtimeSummary,
    ...(contradictionEvidence?.runtimeEvidenceArtifacts ?? []),
    Array.isArray(fallbackEvidence.policySnippets) && fallbackEvidence.policySnippets.length > 0
      ? null
      : isMeaningfulPolicyText(fallbackEvidence.policySummaryShort)
        ? fallbackEvidence.policySummaryShort
        : null,
    ...(Array.isArray(fallbackEvidence.policySnippets)
      ? (fallbackEvidence.policySnippets as unknown[]).filter((entry): entry is string => isMeaningfulPolicyText(entry))
      : []),
    (
      Array.isArray(fallbackEvidence.policySnippets) && fallbackEvidence.policySnippets.length > 0
    ) ||
    isMeaningfulPolicyText(fallbackEvidence.policySummaryShort)
      ? null
      : isMeaningfulPolicyText(fallbackEvidence.signalValue)
        ? fallbackEvidence.signalValue
        : null
  ]).map((snippet) => normalizePolicySnippet(snippet)).filter((snippet): snippet is string => Boolean(snippet));

  const counts: Record<string, number> = {};
  for (const key of [
    "consentFrictionDelta",
    "consentOptInClicks",
    "consentOptOutClicks",
    "keyPageAttemptCount"
  ]) {
    const value = fallbackEvidence[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      counts[key] = value;
    }
  }
  if (fallbackEvidence.cookieAttributeSummary && typeof fallbackEvidence.cookieAttributeSummary === "object") {
    const summary = fallbackEvidence.cookieAttributeSummary as Record<string, unknown>;
    for (const key of [
      "totalCookiesAnalyzed",
      "missingSecureCount",
      "missingHttpOnlyCount",
      "weakSameSiteCount",
      "thirdPartyWeakAttributeCount"
    ]) {
      const value = summary[key];
      if (typeof value === "number" && Number.isFinite(value)) {
        counts[key] = value;
      }
    }
  }
  if (fallbackEvidence.gpcVerification && typeof fallbackEvidence.gpcVerification === "object") {
    const verification = fallbackEvidence.gpcVerification as Record<string, unknown>;
    for (const key of [
      "baselineTrackerCount",
      "baselineThirdPartyCookieCount",
      "gpcTrackerCount",
      "gpcThirdPartyCookieCount",
      "trackerCountDelta",
      "thirdPartyCookieCountDelta"
    ]) {
      const value = verification[key];
      if (typeof value === "number" && Number.isFinite(value)) {
        counts[key] = value;
      }
    }
  }
  if (typeof fallbackEvidence.childrenPrivacyRiskScore === "number" && Number.isFinite(fallbackEvidence.childrenPrivacyRiskScore)) {
    counts.childrenPrivacyRiskScore = fallbackEvidence.childrenPrivacyRiskScore;
  }

  const entities: Record<string, string[]> = {};
  if (Array.isArray(fallbackEvidence.keyPageAttemptedUrls)) {
    entities.attemptedUrls = uniqueStrings(fallbackEvidence.keyPageAttemptedUrls as string[]);
  }
  if (Array.isArray(fallbackEvidence.relatedVendors)) {
    entities.relatedVendors = uniqueStrings(fallbackEvidence.relatedVendors as string[]);
  }
  if ((contradictionEvidence?.relatedVendors.length ?? 0) > 0) {
    entities.relatedVendors = uniqueStrings([...(entities.relatedVendors ?? []), ...((contradictionEvidence?.relatedVendors ?? []) as string[])]);
  }
  if (Array.isArray(fallbackEvidence.runtimeVendors)) {
    entities.runtimeVendors = uniqueStrings(fallbackEvidence.runtimeVendors as string[]);
  }
  if ((contradictionEvidence?.runtimeVendors.length ?? 0) > 0) {
    entities.runtimeVendors = uniqueStrings([...(entities.runtimeVendors ?? []), ...((contradictionEvidence?.runtimeVendors ?? []) as string[])]);
  }
  if (fallbackEvidence.cookieAttributeSummary && typeof fallbackEvidence.cookieAttributeSummary === "object") {
    const summary = fallbackEvidence.cookieAttributeSummary as Record<string, unknown>;
    for (const key of [
      "missingSecureCookieNames",
      "missingHttpOnlyCookieNames",
      "weakSameSiteCookieNames",
      "thirdPartyWeakAttributeCookieNames"
    ]) {
      if (Array.isArray(summary[key])) {
        entities[key] = uniqueStrings(summary[key] as string[]);
      }
    }
  }

  const flags = uniqueStrings([
    typeof fallbackEvidence.familyPacketFamilyId === "string" ? "family_packet_backed" : null,
    typeof fallbackEvidence.familyPacketFamilyId === "string"
      ? `family_packet:${fallbackEvidence.familyPacketFamilyId}`
      : null,
    typeof fallbackEvidence.familyPacketFindingId === "string"
      ? `family_packet_finding:${fallbackEvidence.familyPacketFindingId}`
      : null,
    fallbackEvidence.keyPageGuessedOnly === true ? "guessed_only" : null,
    fallbackEvidence.consentRedirectOrAuthRequired === true ? "redirect_or_auth_required" : null,
    fallbackEvidence.gpcVerification &&
    typeof fallbackEvidence.gpcVerification === "object" &&
    (fallbackEvidence.gpcVerification as { status?: unknown }).status === "ignored"
      ? "gpc_ignored"
      : null,
    fallbackEvidence.ageGatePresent === true ? "age_gate_present" : null,
    fallbackEvidence.childrenAudienceLikely === true ? "children_audience_likely" : null,
    fallbackEvidence.kidDirectedContentDetected === true ? "kid_directed_content_detected" : null,
    fallbackEvidence.parentalConsentReferencePresent === true ? "parental_consent_reference_present" : null,
    fallbackEvidence.mentionsCoppa === true ? "mentions_coppa" : null,
    fallbackEvidence.mentionsUnder13 === true ? "mentions_under_13" : null,
    fallbackEvidence.mentionsUnder16 === true ? "mentions_under_16" : null,
    fallbackEvidence.formCollectsBirthdate === true ? "form_collects_birthdate" : null,
    fallbackEvidence.dateOfBirthInputPresent === true ? "date_of_birth_input_present" : null,
    ...(contradictionEvidence?.supportingSignals ?? []),
    typeof fallbackEvidence.signalKey === "string" ? fallbackEvidence.signalKey : null
  ]);

  return { counts, entities, flags, pageUrls, snippets, sourceUrls };
}

function extractEvidenceFromValidationFinding(finding?: ScanValidationFinding | null) {
  if (!finding?.evidence) {
    return {
      counts: {} as Record<string, number>,
      entities: {} as Record<string, string[]>,
      flags: [] as string[],
      pageUrls: [] as string[],
      snippets: [] as string[],
      sourceUrls: [] as string[]
    };
  }

  const evidence = finding.evidence as Record<string, unknown>;
  const pageUrls = new Set<string>();
  const sourceUrls = new Set<string>();
  const snippets = new Set<string>();
  const flags = new Set<string>();
  const counts: Record<string, number> = {};
  const entities: Record<string, string[]> = {};

  const addEntity = (key: string, values: string[]) => {
    const cleaned = uniqueStrings(values);
    if (cleaned.length === 0) {
      return;
    }
    entities[key] = uniqueStrings([...(entities[key] ?? []), ...cleaned]);
  };

  for (const [key, value] of Object.entries(evidence)) {
    if (typeof value === "string") {
      if (/^https?:\/\//i.test(value.trim())) {
        if (/pageurl|page_url/i.test(key)) {
          pageUrls.add(value);
        } else {
          sourceUrls.add(value);
        }
      } else if (/claim|observed|summary|snippet|evidence|description|rationale/i.test(key) && isReviewerFacingSnippet(value)) {
        snippets.add(value);
      }
      continue;
    }

    if (typeof value === "number" && Number.isFinite(value)) {
      if (/count|score|confidence|delta|attempt/i.test(key)) {
        counts[key] = value;
      }
      continue;
    }

    if (value === true) {
      flags.add(key);
      continue;
    }

    if (!Array.isArray(value)) {
      continue;
    }

    const stringValues = value.filter((entry): entry is string => typeof entry === "string");
    if (stringValues.length === 0) {
      continue;
    }

    if (stringValues.some((entry) => /^https?:\/\//i.test(entry.trim()))) {
      for (const entry of stringValues) {
        if (/pageurl|page_url/i.test(key)) {
          pageUrls.add(entry);
        } else {
          sourceUrls.add(entry);
        }
      }
    } else if (/vendor|cookie|selector|url|page|rule/i.test(key)) {
      addEntity(key, stringValues);
    } else {
      for (const entry of stringValues.filter(isReviewerFacingSnippet).slice(0, 5)) {
        snippets.add(entry);
      }
    }
  }

  return {
    counts,
    entities,
    flags: [...flags],
    pageUrls: [...pageUrls],
    snippets: [...snippets],
    sourceUrls: [...sourceUrls]
  };
}

function mergeEvidence(
  current: UnifiedFindingPacket["evidence"] | undefined,
  next: ReturnType<typeof extractEvidenceFromFallback>,
  candidateEvidence: string[] | undefined,
  linkedValidationFinding?: ScanValidationFinding | null
) {
  const validationEvidence = extractEvidenceFromValidationFinding(linkedValidationFinding);
  const candidateSnippetEvidence = (candidateEvidence ?? [])
    .filter((entry) => !/^https?:\/\//i.test(entry.trim()))
    .filter(isReviewerFacingSnippet)
    .slice(0, 2);
  const pageUrls = uniqueStrings([
    ...(current?.pageUrls ?? []),
    ...(next.pageUrls ?? []),
    ...(validationEvidence.pageUrls ?? []),
    ...(candidateEvidence ?? []).filter((entry) => /^https?:\/\//i.test(entry.trim())),
    linkedValidationFinding?.pageUrl ?? null
  ]);

  const sourceUrls = uniqueStrings([
    ...(current?.sourceUrls ?? []),
    ...(next.sourceUrls ?? []),
    ...(validationEvidence.sourceUrls ?? [])
  ]);

  const snippets = uniqueStrings([
    ...(current?.snippets ?? []),
    ...(next.snippets ?? []),
    ...(validationEvidence.snippets ?? []),
    ...candidateSnippetEvidence
  ]);

  return {
    counts: { ...(current?.counts ?? {}), ...(next.counts ?? {}), ...(validationEvidence.counts ?? {}) },
    entities: {
      ...(current?.entities ?? {}),
      ...(next.entities ?? {}),
      ...(validationEvidence.entities ?? {})
    },
    flags: uniqueStrings([...(current?.flags ?? []), ...(next.flags ?? []), ...(validationEvidence.flags ?? [])]),
    pageUrls,
    snippets,
    sourceUrls
  };
}

function isWeakRootLikeUrl(value: string | null | undefined) {
  if (!value) {
    return false;
  }

  try {
    const parsed = new URL(value);
    const pathname = parsed.pathname.trim();
    return pathname === "" || pathname === "/";
  } catch {
    return /\/?#?$/.test(value);
  }
}

function isMachineReadablePolicyEndpoint(value: string | null | undefined) {
  if (!value) {
    return false;
  }

  try {
    const parsed = new URL(value);
    const host = parsed.hostname.toLowerCase();
    const path = parsed.pathname.toLowerCase();
    return (
      host === "privacyportal.onetrust.com" ||
      path.includes("/request/v1/enterprisepolicy/") ||
      path.includes("/digitalpolicy/content") ||
      path.includes("/api/")
    );
  } catch {
    return /privacyportal\.onetrust\.com|\/request\/v1\/enterprisepolicy\/|\/digitalpolicy\/content|\/api\//i.test(value);
  }
}

function isLikelyLocaleSubdomainUrl(value: string | null | undefined) {
  if (!value) {
    return false;
  }

  try {
    const parsed = new URL(value);
    const host = parsed.hostname.toLowerCase();
    const labels = host.split(".");
    if (labels.length < 3) {
      return false;
    }

    const subdomain = labels[0] ?? "";
    return /^(arabic|ar|es|fr|de|it|pt|jp|ja|kr|ko|cn|zh|ru|tr|nl|sv|no|da|fi|pl|cs|he|id|th|vi)$/i.test(
      subdomain
    );
  } catch {
    return false;
  }
}

function isAccessibilitySpecificUrl(value: string | null | undefined) {
  if (!value) {
    return false;
  }

  try {
    const parsed = new URL(value);
    return /accessibility|caption|audio-description|closed-caption/i.test(parsed.pathname);
  } catch {
    return /accessibility|caption|audio-description|closed-caption/i.test(value);
  }
}

function hasConcreteHumanFacingUrl(urls: Array<string | null | undefined>) {
  return urls.some((value) => typeof value === "string" && /^https?:\/\//i.test(value) && !isMachineReadablePolicyEndpoint(value));
}

function isLikelyHomepageTitle(value: string | null | undefined) {
  if (!value) {
    return false;
  }

  const normalized = value.trim().toLowerCase();
  return (
    normalized.includes("breaking news") ||
    normalized.includes("latest news and videos") ||
    normalized === "home" ||
    normalized.endsWith("| home")
  );
}

function isLikelyPrivacyChoiceSnippet(value: string | null | undefined) {
  if (!value) {
    return false;
  }

  return /privacy choices|privacy rights|do not sell|do not share|targeted advertising|opt out of targeted advertising|manage cookies|cookie settings/i.test(
    value
  );
}

function dedupeEquivalentSnippets(snippets: string[]) {
  const seen = new Set<string>();
  const next: string[] = [];

  for (const snippet of snippets) {
    const normalizedKey = snippet.trim().toLowerCase().replace(/[.!?]+$/g, "");
    if (normalizedKey.length === 0 || seen.has(normalizedKey)) {
      continue;
    }
    seen.add(normalizedKey);
    next.push(snippet);
  }

  return next;
}

function preferMoreSpecificSameHostUrls(urls: string[]) {
  const normalized = uniqueStrings(urls);

  return normalized.filter((candidate) => {
    try {
      const parsedCandidate = new URL(candidate);
      const candidatePath = parsedCandidate.pathname.trim();
      const candidateIsRoot = candidatePath === "" || candidatePath === "/";
      if (!candidateIsRoot) {
        return true;
      }

      return !normalized.some((other) => {
        if (other === candidate) {
          return false;
        }

        try {
          const parsedOther = new URL(other);
          const otherPath = parsedOther.pathname.trim();
          return (
            parsedOther.hostname.toLowerCase() === parsedCandidate.hostname.toLowerCase() &&
            (otherPath !== "" && otherPath !== "/")
          );
        } catch {
          return false;
        }
      });
    } catch {
      return true;
    }
  });
}

function sanitizeEvidenceForFinding(
  findingId: string,
  evidence: UnifiedFindingPacket["evidence"] | undefined
) {
  if (!evidence) {
    return evidence;
  }

  const next = {
    counts: { ...(evidence.counts ?? {}) },
    entities: { ...(evidence.entities ?? {}) },
    flags: [...(evidence.flags ?? [])],
    pageUrls: [...(evidence.pageUrls ?? [])],
    snippets: [...(evidence.snippets ?? [])]
      .filter(isReviewerFacingSnippet)
      .map((snippet) => normalizePolicySnippet(snippet))
      .filter((snippet): snippet is string => Boolean(snippet)),
    sourceUrls: [...(evidence.sourceUrls ?? [])]
  };

  if (
    findingId === "affiliate_disclosure_present" ||
    findingId === "bounded_key_page_discovery_unresolved" ||
    findingId === "behavioral_analytics_disclosure_present" ||
    findingId === "gpc_disclosure_present" ||
    findingId === "privacy_policy_present" ||
    findingId === "privacy_rights_path_present" ||
    findingId === "terms_of_service_present" ||
    findingId === "third_party_advertising_disclosure_present" ||
    findingId === "contact_support_path_present" ||
    findingId === "targeted_advertising_choices_present"
  ) {
    const humanFacingPageUrls = next.pageUrls.filter((url) => !isMachineReadablePolicyEndpoint(url));
    if (humanFacingPageUrls.length > 0) {
      next.pageUrls = humanFacingPageUrls;
    }
  }

  if (findingId === "privacy_policy_present") {
    const humanFacingSourceUrls = next.sourceUrls.filter((url) => !isMachineReadablePolicyEndpoint(url));
    if (humanFacingSourceUrls.length > 0) {
      next.sourceUrls = humanFacingSourceUrls;
    }

    next.snippets = dedupeEquivalentSnippets(next.snippets);
  }

  if (findingId === "contact_support_path_present") {
    const preferredPageUrls = preferMoreSpecificSameHostUrls(next.pageUrls);
    if (preferredPageUrls.length > 0) {
      next.pageUrls = preferredPageUrls;
    }

    const preferredSourceUrls = preferMoreSpecificSameHostUrls(next.sourceUrls);
    if (preferredSourceUrls.length > 0) {
      next.sourceUrls = preferredSourceUrls;
    }
  }

  if (findingId === "targeted_advertising_choices_present") {
    const preferredPageUrls = next.pageUrls.filter((url) => !isWeakRootLikeUrl(url) && !isMachineReadablePolicyEndpoint(url));
    if (preferredPageUrls.length > 0) {
      next.pageUrls = preferredPageUrls;
    }

    const preferredSourceUrls = next.sourceUrls.filter(
      (url) => !isWeakRootLikeUrl(url) && !isMachineReadablePolicyEndpoint(url)
    );
    if (preferredSourceUrls.length > 0) {
      next.sourceUrls = preferredSourceUrls;
    }

    const specificPageUrls = preferMoreSpecificSameHostUrls(next.pageUrls);
    if (specificPageUrls.length > 0) {
      next.pageUrls = specificPageUrls;
    }

    const specificSourceUrls = preferMoreSpecificSameHostUrls(next.sourceUrls);
    if (specificSourceUrls.length > 0) {
      next.sourceUrls = specificSourceUrls;
    }

    const nonHomepageSnippets = next.snippets.filter((snippet) => !isLikelyHomepageTitle(snippet));
    if (nonHomepageSnippets.length > 0) {
      next.snippets = nonHomepageSnippets;
    }

    const privacyChoiceSnippets = next.snippets.filter((snippet) => isLikelyPrivacyChoiceSnippet(snippet));
    if (privacyChoiceSnippets.length > 0) {
      next.snippets = privacyChoiceSnippets;
    }
  }

  if (findingId === "privacy_rights_path_present") {
    const preferredPageUrls = next.pageUrls.filter((url) => !isWeakRootLikeUrl(url) && !isMachineReadablePolicyEndpoint(url));
    if (preferredPageUrls.length > 0) {
      next.pageUrls = preferMoreSpecificSameHostUrls(preferredPageUrls);
    }

    const preferredSourceUrls = next.sourceUrls.filter(
      (url) => !isWeakRootLikeUrl(url) && !isMachineReadablePolicyEndpoint(url)
    );
    if (preferredSourceUrls.length > 0) {
      next.sourceUrls = preferMoreSpecificSameHostUrls(preferredSourceUrls);
    }
  }

  if (findingId === "terms_of_service_present") {
    const nonLocalePageUrls = next.pageUrls.filter((url) => !isLikelyLocaleSubdomainUrl(url));
    if (nonLocalePageUrls.length > 0) {
      next.pageUrls = nonLocalePageUrls;
    }

    const nonLocaleSourceUrls = next.sourceUrls.filter((url) => !isLikelyLocaleSubdomainUrl(url));
    if (nonLocaleSourceUrls.length > 0) {
      next.sourceUrls = nonLocaleSourceUrls;
    }

    const allUrls = [...next.pageUrls, ...next.sourceUrls];
    const hasOnlyLocaleUrls = allUrls.length > 0 && allUrls.every((url) => isLikelyLocaleSubdomainUrl(url));
    if (hasOnlyLocaleUrls) {
      next.pageUrls = [];
      next.sourceUrls = [];
      next.snippets = [];
    }
  }

  if (findingId === "accessibility_support_path_present") {
    const accessibilitySpecificPageUrls = next.pageUrls.filter((url) => isAccessibilitySpecificUrl(url));
    if (accessibilitySpecificPageUrls.length > 0) {
      next.pageUrls = accessibilitySpecificPageUrls;
    }

    const accessibilitySpecificSourceUrls = next.sourceUrls.filter((url) => isAccessibilitySpecificUrl(url));
    if (accessibilitySpecificSourceUrls.length > 0) {
      next.sourceUrls = accessibilitySpecificSourceUrls;
    }
  }

  if (findingId === "third_party_advertising_disclosure_present") {
    const preferredPageUrls = next.pageUrls.filter((url) => !isMachineReadablePolicyEndpoint(url));
    if (preferredPageUrls.length > 0) {
      next.pageUrls = preferMoreSpecificSameHostUrls(preferredPageUrls);
    }

    const preferredSourceUrls = next.sourceUrls.filter((url) => !isMachineReadablePolicyEndpoint(url));
    if (preferredSourceUrls.length > 0) {
      next.sourceUrls = preferMoreSpecificSameHostUrls(preferredSourceUrls);
    }
  }

  if (isPacketBackedEvidence(evidence, findingId)) {
    const preferredPageUrls = preferMoreSpecificSameHostUrls(next.pageUrls);
    if (preferredPageUrls.length > 0) {
      next.pageUrls = preferredPageUrls;
    }

    const preferredSourceUrls = preferMoreSpecificSameHostUrls(next.sourceUrls);
    if (preferredSourceUrls.length > 0) {
      next.sourceUrls = preferredSourceUrls;
    }
  }

  if (findingId === "cookie_policy_present") {
    next.pageUrls = next.pageUrls.filter((url) => !isWeakRootLikeUrl(url) && !isMachineReadablePolicyEndpoint(url));
    next.sourceUrls = next.sourceUrls.filter((url) => !isWeakRootLikeUrl(url) && !isMachineReadablePolicyEndpoint(url));
    if (next.pageUrls.length === 0) {
      next.snippets = [];
    }
  }

  if (findingId === "cookie_policy_structurally_obstructed") {
    const allUrls = [...next.pageUrls, ...next.sourceUrls];
    const hasOnlyWeakRootUrls = allUrls.length > 0 && allUrls.every((url) => isWeakRootLikeUrl(url));
    if (hasOnlyWeakRootUrls) {
      next.pageUrls = [];
      next.sourceUrls = [];
      next.snippets = [];
    }
  }

  return next;
}

function getSourceUrl(packet: UnifiedFindingPacket) {
  return packet.primaryPageUrl ?? packet.evidence?.pageUrls?.[0] ?? packet.evidence?.sourceUrls?.[0];
}

function isGenericObservationText(value: string | null | undefined) {
  if (!value) {
    return false;
  }

  const normalized = value.trim().toLowerCase();
  return (
    normalized === "this signal is worth reviewer attention." ||
    normalized === "promotional or choice architecture may need closer disclosure review." ||
    normalized === "the scan flagged age-related or youth-directed context that may raise children’s privacy review expectations."
  );
}

function looksSynthesizedPolicySummary(value: string | null | undefined) {
  if (!value) {
    return false;
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return false;
  }

  const dateLikeMatches = trimmed.match(
    /\b(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2},\s+\d{4}\b/gi
  );
  return Boolean((dateLikeMatches?.length ?? 0) >= 2 || trimmed.includes("—"));
}

function selectObservedValue(packet: UnifiedFindingPacket) {
  const snippet = packet.evidence?.snippets?.[0] ?? null;
  const summary = packet.summary;

  if (packet.unifiedFindingId === "retargeting_pixel_observed") {
    return "The scan retained a detector-backed retargeting or remarketing signal that merits manual confirmation.";
  }

  if (packet.unifiedFindingId === "arbitration_clause_present") {
    if (snippet && !looksSynthesizedPolicySummary(snippet) && !isGenericObservationText(snippet)) {
      return snippet;
    }

    return "The scan retained terms language that appears to include arbitration or dispute-resolution provisions worth reading directly.";
  }

  if (snippet && !isGenericObservationText(snippet)) {
    return snippet;
  }

  return getBestObservedValue([summary]) ?? null;
}

function hasConcretePayloadEvidence(fallbackEvidence?: Record<string, unknown> | null) {
  if (!Array.isArray(fallbackEvidence?.sensitivePayloadViolations)) {
    return false;
  }

  return fallbackEvidence.sensitivePayloadViolations.some(
    (row): boolean =>
      Boolean(row) &&
      typeof row === "object" &&
      (row as { evidenceStrength?: unknown }).evidenceStrength !== "detector_only"
  );
}

function getNormalizedConcernStrengthFlags(rows: Array<Record<string, unknown> | null | undefined>) {
  return uniqueConcernFlags(
    rows.flatMap((row) =>
      Array.isArray(row?.normalizedConcernEvidenceStrengthFlags)
        ? row.normalizedConcernEvidenceStrengthFlags.filter(
            (flag): flag is NormalizedConcernEvidenceStrengthFlag => typeof flag === "string"
          )
        : []
    )
  );
}

function deriveConfidenceInputs(input: {
  packet: UnifiedFindingPacket;
  validationFindings: ScanValidationFinding[];
  fallbackEvidenceRows: Array<Record<string, unknown> | null | undefined>;
}) {
  const sourceKinds = [...new Set(input.packet.sourceRefs.map((sourceRef) => sourceRef.kind))];
  const signalCount = input.packet.sourceRefs.filter((sourceRef) => sourceRef.kind === "signal").length;
  const validationCount = input.packet.sourceRefs.filter((sourceRef) => sourceRef.kind === "validation").length;
  const issueCount = input.packet.sourceRefs.filter((sourceRef) => sourceRef.kind === "issue").length;
  const validationEvidenceRows = input.validationFindings
    .map((finding) => finding.evidence)
    .filter((evidence): evidence is Record<string, unknown> => Boolean(evidence) && typeof evidence === "object");
  const allEvidenceRows = [...validationEvidenceRows, ...input.fallbackEvidenceRows.filter(Boolean) as Record<string, unknown>[]];
  const normalizedConcernStrengthFlags = getNormalizedConcernStrengthFlags(input.fallbackEvidenceRows);
  const evidenceQualityFlags = uniqueStrings([
    ...(input.packet.evidence?.flags ?? []),
    ...normalizedConcernStrengthFlags,
    ...allEvidenceRows.flatMap((row) =>
      Object.entries(row)
        .filter(([, value]) => value === true)
        .map(([key]) => key)
    )
  ]);

  const hasDirectRuntimeEvidence =
    input.packet.sourceRefs.some((sourceRef) => sourceRef.kind === "signal" && sourceRef.source === "runtime_artifact_signal") ||
    normalizedConcernStrengthFlags.includes("direct_runtime") ||
    input.fallbackEvidenceRows.some(
      (row) => Boolean(row?.gpcVerification) && typeof row.gpcVerification === "object"
    ) ||
    input.fallbackEvidenceRows.some((row) => (getContradictionEvidenceBundle(row)?.runtimeEvidenceArtifacts.length ?? 0) > 0) ||
    validationEvidenceRows.some((row) =>
      Object.keys(row).some((key) => /runtime|request|network|tracker/i.test(key))
    );

  const hasPolicyTextEvidence = normalizedConcernStrengthFlags.includes("policy_text") || allEvidenceRows.some((row) =>
    {
      const contradictionEvidence = getContradictionEvidenceBundle(row);
      return (
        Boolean(contradictionEvidence?.policySnippet) ||
        Boolean(contradictionEvidence?.claim) ||
        Object.keys(row).some((key) => /claim|policy|disclosure|summary|snippet|description|pageurl|page_url/i.test(key))
      );
    }
  );

  const hasKeyPageDiscoveryEvidence = normalizedConcernStrengthFlags.includes("key_page_discovery") || allEvidenceRows.some((row) =>
    Object.keys(row).some((key) => /keyPage|attemptedUrls|attemptCount|stopReason|discovery/i.test(key))
  );

  const hasStructuredValidationEvidence =
    normalizedConcernStrengthFlags.includes("structured_validation") || validationEvidenceRows.length > 0;
  const concretePayloadEvidence =
    normalizedConcernStrengthFlags.includes("concrete_payload") || input.fallbackEvidenceRows.some((row) => hasConcretePayloadEvidence(row));
  const isFallbackOnly =
    (normalizedConcernStrengthFlags.includes("fallback_only") ||
      (validationCount === 0 && !hasDirectRuntimeEvidence && signalCount > 0)) &&
    !hasStructuredValidationEvidence;
  const hasPageAttribution =
    normalizedConcernStrengthFlags.includes("page_attributed") ||
    (input.packet.affectedPageCount ?? 0) > 0 ||
    (input.packet.evidence?.sourceUrls?.length ?? 0) > 0;

  return {
    evidenceQualityFlags,
    hasConcretePayloadEvidence: concretePayloadEvidence,
    hasDirectRuntimeEvidence,
    hasKeyPageDiscoveryEvidence,
    hasPageAttribution,
    hasPolicyTextEvidence,
    hasStructuredValidationEvidence,
    isFallbackOnly,
    issueCount,
    signalCount,
    sourceCount: input.packet.sourceRefs.length,
    sourceKinds,
    validationCount
  };
}

function deriveConfidenceBand(
  inputs: UnifiedFindingPacket["confidenceInputs"],
  severity: ReviewFindingSeverity
): UnifiedFindingPacket["confidenceBand"] {
  let score = 0;

  if (inputs.signalCount > 0) {
    score += 1;
  }
  if (inputs.validationCount > 0) {
    score += 2;
  }
  if (inputs.issueCount > 0) {
    score += 1;
  }
  if (inputs.hasStructuredValidationEvidence) {
    score += 1;
  }
  if (inputs.sourceKinds.length > 1) {
    score += 1;
  }
  if (inputs.hasDirectRuntimeEvidence) {
    score += 2;
  }
  if (inputs.hasPolicyTextEvidence) {
    score += 1;
  }
  if (inputs.hasKeyPageDiscoveryEvidence) {
    score += 1;
  }
  if (inputs.hasConcretePayloadEvidence) {
    score += 2;
  }
  if (inputs.hasKeyPageDiscoveryEvidence || inputs.hasConcretePayloadEvidence) {
    score += 1;
  }
  if (inputs.isFallbackOnly) {
    score -= inputs.hasConcretePayloadEvidence ? 0 : 2;
  }
  if (inputs.hasKeyPageDiscoveryEvidence && inputs.validationCount === 0 && inputs.issueCount === 0) {
    score -= 1;
  }
  if (severity === "high" && inputs.validationCount === 0 && !inputs.hasDirectRuntimeEvidence && !inputs.hasConcretePayloadEvidence) {
    score -= 1;
  }

  if (score >= 5) {
    return "high";
  }
  if (score >= 2) {
    return "moderate";
  }
  return "low";
}

function hasFamilyPacketFlag(flags: string[] | undefined, findingId?: string) {
  const normalizedFlags = flags ?? [];
  if (!normalizedFlags.includes("family_packet_backed")) {
    return false;
  }

  return findingId ? normalizedFlags.includes(`family_packet_finding:${findingId}`) : true;
}

function hasFamilyPacketFindingSource(packet: UnifiedFindingPacket, findingId?: string) {
  return hasFamilyPacketFlag(packet.evidence?.flags, findingId);
}

function isPacketBackedEvidence(evidence: UnifiedFindingPacket["evidence"] | undefined, findingId?: string) {
  return hasFamilyPacketFlag(evidence?.flags, findingId);
}

type PacketizedFindingSupportRule = {
  findingId: string;
  policyPageType:
    | "privacy_policy"
    | "cookie_policy"
    | "terms_of_service"
    | "accessibility_statement"
    | "contact_page"
    | "affiliate_disclosure"
    | null;
  rationale: string;
  matchesLegacySource: (packet: UnifiedFindingPacket) => boolean;
};

type PolicyEnrichmentFindingSupportRule = {
  findingId:
    | "privacy_contact_path_present"
    | "gpc_disclosure_present"
    | "tracking_technologies_disclosure_present"
    | "targeted_advertising_disclosure_present"
    | "behavioral_analytics_disclosure_present"
    | "children_privacy_disclosure_present"
    | "arbitration_clause_present";
  rationale: string;
};

type DomainFlagFindingSupportRule = {
  findingId:
    | "consent_surface_missing"
    | "accessibility_support_path_missing"
    | "sale_sharing_controls_missing";
  evidenceFlag: string;
  rationale: string;
};

const PACKETIZED_FINDING_SUPPORT_RULES: PacketizedFindingSupportRule[] = [
  {
    findingId: "privacy_policy_present",
    policyPageType: "privacy_policy",
    rationale: "Surfaced because the scan retained a reachable privacy-policy surface.",
    matchesLegacySource: (packet) =>
      packet.sourceRefs.some(
        (sourceRef) =>
          sourceRef.kind === "signal" &&
          sourceRef.source === "snapshot_signal" &&
          sourceRef.key === "disclosure.privacy_policy_present"
      )
  },
  {
    findingId: "terms_of_service_present",
    policyPageType: "terms_of_service",
    rationale: "Surfaced because the scan retained a reachable terms surface.",
    matchesLegacySource: (packet) =>
      packet.sourceRefs.some(
        (sourceRef) =>
          sourceRef.kind === "signal" &&
          sourceRef.source === "snapshot_signal" &&
          sourceRef.key === "disclosure.terms_of_service_present"
      )
  },
  {
    findingId: "cookie_policy_present",
    policyPageType: "cookie_policy",
    rationale: "Surfaced because the scan retained a reachable cookie-policy or cookie-settings surface.",
    matchesLegacySource: (packet) =>
      packet.sourceRefs.some(
        (sourceRef) =>
          sourceRef.kind === "signal" &&
          sourceRef.source === "snapshot_signal" &&
          sourceRef.key === "disclosure.cookie_policy_present"
      )
  },
  {
    findingId: "contact_support_path_present",
    policyPageType: "contact_page",
    rationale: "Surfaced because the scan retained a reachable contact or feedback path.",
    matchesLegacySource: (packet) =>
      packet.sourceRefs.some(
        (sourceRef) =>
          sourceRef.kind === "signal" &&
          sourceRef.source === "snapshot_signal" &&
          sourceRef.key === "disclosure.contact_page_present"
      )
  },
  {
    findingId: "targeted_advertising_choices_present",
    policyPageType: "privacy_policy",
    rationale: "Surfaced because the scan retained a targeted-advertising or do-not-sell/share choice path.",
    matchesLegacySource: (packet) =>
      packet.sourceRefs.some(
        (sourceRef) =>
          sourceRef.kind === "signal" &&
          sourceRef.source === "snapshot_signal" &&
          sourceRef.key === "privacy.do_not_sell_link_present"
      )
  },
  {
    findingId: "gpc_signal_not_honored",
    policyPageType: null,
    rationale: "Surfaced because runtime privacy verification retained evidence that the browser-level GPC signal was ignored.",
    matchesLegacySource: (packet) =>
      packet.sourceRefs.some(
        (sourceRef) =>
          sourceRef.kind === "signal" &&
          sourceRef.source === "runtime_artifact_signal" &&
          sourceRef.key === "privacy.gpc_signal_not_honored"
      )
  },
  {
    findingId: "privacy_rights_path_present",
    policyPageType: "privacy_policy",
    rationale: "Surfaced because structured policy evidence retained a concrete privacy-rights path.",
    matchesLegacySource: (packet) =>
      packet.sourceRefs.some(
        (sourceRef) =>
          sourceRef.kind === "signal" &&
          sourceRef.source === "policy_enrichment_signal" &&
          getPolicyPositiveSignalKeysForFinding("privacy_rights_path_present").includes(sourceRef.key)
      )
  },
  {
    findingId: "children_privacy_disclosure_present",
    policyPageType: "privacy_policy",
    rationale: "Surfaced because structured policy evidence retained an explicit children's or under-13 privacy disclosure.",
    matchesLegacySource: (packet) =>
      packet.sourceRefs.some(
        (sourceRef) =>
          sourceRef.kind === "signal" &&
          sourceRef.source === "policy_enrichment_signal" &&
          getPolicyPositiveSignalKeysForFinding("children_privacy_disclosure_present").includes(sourceRef.key)
      )
  },
  {
    findingId: "accessibility_support_path_present",
    policyPageType: "accessibility_statement",
    rationale: "Surfaced because the scan retained a clear domain-level accessibility support path.",
    matchesLegacySource: (packet) =>
      packet.sourceRefs.some(
        (sourceRef) =>
          sourceRef.kind === "signal" &&
          sourceRef.source === "snapshot_signal" &&
          sourceRef.key === "accessibility.accessibility_contact_method_present"
      )
  },
  {
    findingId: "affiliate_disclosure_present",
    policyPageType: "affiliate_disclosure",
    rationale: "Surfaced because the scan retained a clear domain-level affiliate disclosure signal.",
    matchesLegacySource: (packet) =>
      packet.sourceRefs.some(
        (sourceRef) =>
          sourceRef.kind === "signal" &&
          sourceRef.source === "snapshot_signal" &&
          sourceRef.key === "commerce.affiliate_disclosure_present"
      )
  },
  {
    findingId: "third_party_advertising_disclosure_present",
    policyPageType: "affiliate_disclosure",
    rationale:
      "Surfaced because structured policy evidence retained a disclosure about third-party advertising partners or related ad technologies.",
    matchesLegacySource: (packet) =>
      packet.sourceRefs.some(
        (sourceRef) =>
          sourceRef.kind === "signal" &&
          sourceRef.source === "policy_enrichment_signal" &&
          getPolicyPositiveSignalKeysForFinding("third_party_advertising_disclosure_present").includes(sourceRef.key)
      )
  }
];

const POLICY_ENRICHMENT_FINDING_SUPPORT_RULES: PolicyEnrichmentFindingSupportRule[] = [
  {
    findingId: "privacy_contact_path_present",
    rationale: "Surfaced because structured policy evidence retained a clear privacy contact path."
  },
  {
    findingId: "gpc_disclosure_present",
    rationale: "Surfaced because structured policy evidence retained a clear disclosure about GPC handling."
  },
  {
    findingId: "tracking_technologies_disclosure_present",
    rationale:
      "Surfaced because structured policy evidence retained a disclosure about cookies, pixels, tags, beacons, scripts, or similar technologies."
  },
  {
    findingId: "targeted_advertising_disclosure_present",
    rationale: "Surfaced because structured policy evidence retained a targeted-advertising or sale/sharing disclosure."
  },
  {
    findingId: "behavioral_analytics_disclosure_present",
    rationale: "Surfaced because structured policy evidence retained a disclosure about behavioral analytics or replay-style monitoring."
  },
  {
    findingId: "children_privacy_disclosure_present",
    rationale: "Surfaced because structured policy evidence retained a children's or youth-related privacy disclosure."
  },
  {
    findingId: "arbitration_clause_present",
    rationale: "Surfaced because structured policy evidence retained an arbitration or dispute-resolution clause."
  }
];

const DOMAIN_FLAG_FINDING_SUPPORT_RULES: DomainFlagFindingSupportRule[] = [
  {
    findingId: "consent_surface_missing",
    evidenceFlag: "privacy.consent_surface_missing",
    rationale: "Surfaced because the scan retained a clear domain-level signal that no user-facing consent surface was detected."
  },
  {
    findingId: "accessibility_support_path_missing",
    evidenceFlag: "accessibility.accessibility_support_path_missing",
    rationale: "Surfaced because the scan retained a clear domain-level signal that no accessibility support path was detected."
  },
  {
    findingId: "sale_sharing_controls_missing",
    evidenceFlag: "privacy.sale_sharing_controls_missing",
    rationale:
      "Surfaced because the scan retained a clear domain-level signal that sale or sharing controls were not detected despite retargeting-related behavior."
  }
];

function getPacketizedFindingSupportRule(findingId: string) {
  return PACKETIZED_FINDING_SUPPORT_RULES.find((rule) => rule.findingId === findingId) ?? null;
}

function getPacketizedPolicyPageType(findingId: string) {
  return getPacketizedFindingSupportRule(findingId)?.policyPageType ?? null;
}

function getPolicyEnrichmentFindingSupportRule(findingId: string) {
  return POLICY_ENRICHMENT_FINDING_SUPPORT_RULES.find((rule) => rule.findingId === findingId) ?? null;
}

function getDomainFlagFindingSupportRule(findingId: string) {
  return DOMAIN_FLAG_FINDING_SUPPORT_RULES.find((rule) => rule.findingId === findingId) ?? null;
}

function hasNoRetainedReviewerEvidence(packet: UnifiedFindingPacket) {
  return (
    (packet.evidence?.pageUrls?.length ?? 0) === 0 &&
    (packet.evidence?.sourceUrls?.length ?? 0) === 0 &&
    (packet.evidence?.snippets?.length ?? 0) === 0
  );
}

function getPacketizedFindingEvidenceDecision(packet: UnifiedFindingPacket): UnifiedFindingPresentationDecision | null {
  if (packet.unifiedFindingId === "cookie_policy_present" && hasNoRetainedReviewerEvidence(packet)) {
    return {
      confidenceRationale: buildConfidenceRationale(packet),
      rationale: "Suppressed because the scan did not retain a concrete cookie-policy or cookie-settings page after weak placeholder cleanup.",
      status: "suppress"
    };
  }

  if (packet.unifiedFindingId === "terms_of_service_present" && hasNoRetainedReviewerEvidence(packet)) {
    return {
      confidenceRationale: buildConfidenceRationale(packet),
      rationale:
        "Suppressed because the retained terms surface was only a locale-specific alternate and the scan did not retain a canonical terms page for the root-domain experience.",
      status: "suppress"
    };
  }

  if (
    (
      packet.unifiedFindingId === "affiliate_disclosure_present" ||
      packet.unifiedFindingId === "behavioral_analytics_disclosure_present" ||
      packet.unifiedFindingId === "gpc_disclosure_present" ||
      packet.unifiedFindingId === "third_party_advertising_disclosure_present"
    ) &&
    (
      (packet.evidence?.snippets?.length ?? 0) === 0 ||
      !hasConcreteHumanFacingUrl([...(packet.evidence?.pageUrls ?? []), ...(packet.evidence?.sourceUrls ?? [])])
    )
  ) {
    const rationaleByFindingId: Partial<Record<UnifiedFindingId, string>> = {
      affiliate_disclosure_present:
        "Kept audit-only because affiliate disclosures should surface buyer-facing only when the scan retains both readable disclosure text and a concrete user-facing disclosure URL.",
      behavioral_analytics_disclosure_present:
        "Kept audit-only because behavioral-analytics disclosures should surface buyer-facing only when the scan retains both readable disclosure text and a concrete user-facing disclosure URL.",
      gpc_disclosure_present:
        "Kept audit-only because GPC disclosures should surface buyer-facing only when the scan retains both readable disclosure text and a concrete user-facing disclosure URL.",
      third_party_advertising_disclosure_present:
        "Kept audit-only because third-party advertising disclosures should surface buyer-facing only when the scan retains both readable disclosure text and a concrete user-facing disclosure URL."
    };

    return {
      confidenceRationale: buildConfidenceRationale(packet),
      rationale: rationaleByFindingId[packet.unifiedFindingId] ?? "Kept audit-only because the retained evidence is too thin to surface buyer-facing.",
      status: "audit_only"
    };
  }

  return null;
}

function getThinFinancialTransparencyDecision(packet: UnifiedFindingPacket): UnifiedFindingPresentationDecision | null {
  if (!isFinancialValidationFindingId(packet.unifiedFindingId)) {
    return null;
  }

  const inferredFinancialPageClassification =
    packet.unifiedFindingId === "legal_entity_name_present" || packet.unifiedFindingId === "operator_contact_path_present"
      ? "identity_or_contact"
      : packet.unifiedFindingId === "fee_disclosure_present"
        ? "pricing_or_fees"
        : packet.unifiedFindingId === "investment_risk_disclosure_present" ||
            packet.unifiedFindingId === "past_performance_disclaimer_present"
          ? "disclosure_or_legal"
          : "financial_offer";
  const validationSpec = getFinancialValidationSpec(packet.unifiedFindingId);

  const evidence = getFinancialValidationEvidenceBundle({
    pageClassification: inferredFinancialPageClassification,
    pageUrls: packet.evidence?.pageUrls ?? [],
    snippets: packet.evidence?.snippets ?? [],
    sourceUrls: packet.evidence?.sourceUrls ?? [],
    supportingSignals: validationSpec?.requiredSignalKeys ?? [],
    pageType: packet.primaryPageUrl ? "product" : "unknown"
  });

  if (!evidence) {
    return null;
  }

  const storedJudge = getStoredFinancialJudgeOutput({
    financialJudgeVerdict: packet.details && "financialJudgeVerdict" in packet.details ? null : null,
    ...((packet.sourceRefs.find((ref) => ref.kind === "signal")?.fallbackEvidence as Record<string, unknown> | undefined) ?? {})
  });
  const judge =
    storedJudge ??
    evaluateFinancialJudgeInput({
      candidateFindingId: packet.unifiedFindingId,
      evidence,
      negativeEvidenceFlags: packet.concernContext?.negativeEvidenceFlags ?? [],
      scanContext: {
        domain: packet.primaryPageUrl,
        pageType: "unknown"
      }
    });

  if (judge.verdict === "confirm") {
    return null;
  }

  const rationaleByFindingId: Record<string, string> = {
    apr_or_interest_rate_disclosure_present:
      "Kept audit-only because APR or interest-rate disclosures should surface buyer-facing only when the scan retains both readable rate text and a concrete user-facing disclosure URL.",
    fee_disclosure_present:
      "Kept audit-only because fee disclosures should surface buyer-facing only when the scan retains both readable fee text and a concrete user-facing disclosure URL.",
    investment_risk_disclosure_present:
      "Kept audit-only because investment-risk disclosures should surface buyer-facing only when the scan retains both readable disclosure text and a concrete user-facing disclosure URL.",
    legal_entity_name_present:
      "Kept audit-only because legal-entity identity findings should surface buyer-facing only when the scan retains both readable operator text and a concrete user-facing disclosure URL.",
    operator_contact_path_present:
      "Kept audit-only because operator-contact findings should surface buyer-facing only when the scan retains both readable contact text and a concrete user-facing disclosure URL.",
    past_performance_disclaimer_present:
      "Kept audit-only because past-performance disclaimers should surface buyer-facing only when the scan retains both readable disclaimer text and a concrete user-facing disclosure URL."
  };

  if (judge.verdict === "suppress") {
    return {
      confidenceRationale: buildConfidenceRationale(packet),
      rationale: "Suppressed because the retained evidence did not stay in an explicit financial context after conservative financial validation.",
      status: "suppress"
    };
  }

  return {
    confidenceRationale: buildConfidenceRationale(packet),
    rationale: rationaleByFindingId[packet.unifiedFindingId] ?? "Kept audit-only because the retained evidence is too thin to surface buyer-facing.",
    status: "audit_only"
  };
}

function getCoverageSiblingSuppressionDecision(input: {
  packet: UnifiedFindingPacket;
  siblingRows: UnifiedFindingPacket[];
}): UnifiedFindingPresentationDecision | null {
  if (
    input.packet.unifiedFindingId === "cookie_policy_structurally_obstructed" &&
    hasNoRetainedReviewerEvidence(input.packet) &&
    input.siblingRows.some((row) => row.unifiedFindingId === "cookie_policy_present")
  ) {
    return {
      confidenceRationale: buildConfidenceRationale(input.packet),
      rationale: "Suppressed because the scan already retained a cookie-policy or cookie-settings surface, and the obstruction evidence here is only a weak discovery artifact.",
      status: "suppress"
    };
  }

  if (
    input.packet.unifiedFindingId === "contact_page_missing_surface" &&
    input.siblingRows.some(
      (row) =>
        row.unifiedFindingId === "accessibility_support_path_present" ||
        row.unifiedFindingId === "privacy_contact_path_present" ||
        row.unifiedFindingId === "contact_support_path_present"
    )
  ) {
    return {
      confidenceRationale: buildConfidenceRationale(input.packet),
      rationale: "Suppressed because another retained support or contact path already gives users a visible way to reach help on this scan.",
      status: "suppress"
    };
  }

  return null;
}

function getUnavailableCoverageDecision(packet: UnifiedFindingPacket): UnifiedFindingPresentationDecision | null {
  if (
    (packet.unifiedFindingId === "cookie_policy_unavailable" ||
      packet.unifiedFindingId === "accessibility_statement_unavailable") &&
    (packet.evidence?.flags?.includes("guessed_only") ||
      !hasConfirmedLinkedDiscoverySource(
        packet.details?.family === "coverage_gap" ? packet.details.bestDiscoverySource : null
      ))
  ) {
    return {
      confidenceRationale: buildConfidenceRationale(packet),
      rationale: "Suppressed because the unavailable page was not tied to a strong confirmed linked target from the scanned site.",
      status: "suppress"
    };
  }

  return null;
}

function getSpecificAuditOnlyEvidenceDecision(packet: UnifiedFindingPacket): UnifiedFindingPresentationDecision | null {
  if (
    packet.unifiedFindingId === "weak_cookie_security_attributes" &&
    ![
      ...(packet.evidence?.entities?.missingSecureCookieNames ?? []),
      ...(packet.evidence?.entities?.missingHttpOnlyCookieNames ?? []),
      ...(packet.evidence?.entities?.weakSameSiteCookieNames ?? []),
      ...(packet.evidence?.entities?.thirdPartyWeakAttributeCookieNames ?? [])
    ].some((value) => typeof value === "string" && value.trim().length > 0)
  ) {
    return {
      confidenceRationale: buildConfidenceRationale(packet),
      rationale: "Kept for audit only because the current evidence does not retain concrete cookie examples for the weak attribute claim.",
      status: "audit_only"
    };
  }

  if (packet.unifiedFindingId === "accessibility_risk_score") {
    return {
      confidenceRationale: buildConfidenceRationale(packet),
      rationale:
        "Kept for audit only because automated accessibility risk scores are still best treated as reviewer triage, even when representative examples are retained.",
      status: "audit_only"
    };
  }

  return null;
}

function getContradictionDecision(input: {
  packet: UnifiedFindingPacket;
  siblingRows: UnifiedFindingPacket[];
}): UnifiedFindingPresentationDecision | null {
  if (
    input.packet.unifiedFindingId === "policy_behavior_conflict" &&
    input.siblingRows.some((row) => SPECIFIC_CONTRADICTION_FINDING_IDS.has(row.unifiedFindingId))
  ) {
    return {
      confidenceRationale: buildConfidenceRationale(input.packet),
      rationale: "Suppressed because a more specific contradiction finding already explains this concern.",
      status: "suppress"
    };
  }

  if (input.packet.unifiedFindingId === "consent_gated_tracking_claim_conflict") {
    return {
      confidenceRationale: buildConfidenceRationale(input.packet),
      rationale: "Kept for audit only because consent-gated contradiction findings need tighter paired policy and runtime evidence before buyer-facing surfacing.",
      status: "audit_only"
    };
  }

  if (
    input.packet.details?.family === "contradiction" &&
    (!input.packet.confidenceInputs.hasPolicyTextEvidence ||
      (!input.packet.confidenceInputs.hasDirectRuntimeEvidence && !input.packet.confidenceInputs.hasConcretePayloadEvidence))
  ) {
    return {
      confidenceRationale: buildConfidenceRationale(input.packet),
      rationale: "Kept for audit only because contradiction findings need both concrete policy text and concrete runtime evidence before buyer-facing surfacing.",
      status: "audit_only"
    };
  }

  return null;
}

function getPreconsentTrackingDecision(packet: UnifiedFindingPacket): UnifiedFindingPresentationDecision | null {
  if (packet.unifiedFindingId !== "preconsent_tracking") {
    return null;
  }

  const detailVendors = packet.details?.family === "consent_tracking" ? packet.details.vendors ?? [] : [];
  const detailRequestUrls = packet.details?.family === "consent_tracking" ? packet.details.requestUrls ?? [] : [];
  const runtimeVendors = packet.evidence?.entities?.runtimeVendors ?? [];
  const relatedVendors = packet.evidence?.entities?.relatedVendors ?? [];
  const evidenceUrls = packet.evidence?.pageUrls ?? [];
  const hasConcreteRuntimeVendorEvidence = [...detailVendors, ...runtimeVendors, ...relatedVendors].some(
    (value) => typeof value === "string" && value.trim().length > 0
  );
  const hasConcreteRuntimeUrlEvidence = [...detailRequestUrls, ...evidenceUrls].some(
    (value) => typeof value === "string" && /^https?:\/\//i.test(value)
  );
  const hasValidationBacking = packet.confidenceInputs.validationCount > 0;

  if (hasValidationBacking && hasConcreteRuntimeVendorEvidence && hasConcreteRuntimeUrlEvidence) {
    return null;
  }

  return {
    confidenceRationale: buildConfidenceRationale(packet),
    rationale:
      "Kept for audit only because pre-consent tracking should surface buyer-facing only when validation-backed runtime evidence retains both concrete vendors and concrete request URLs.",
    status: "audit_only"
  };
}

function getMinorsContextDecision(packet: UnifiedFindingPacket): UnifiedFindingPresentationDecision | null {
  const isDomainLevelSensitiveContext = isDomainLevelSensitiveContextFinding(packet.unifiedFindingId);
  const isDomainLevelChildrenDisclosureContext = isDomainLevelChildrenDisclosureFinding(packet.unifiedFindingId);
  const minorsContextEvidenceCount = [
    "age_gate_present",
    "children_audience_likely",
    "kid_directed_content_detected",
    "parental_consent_reference_present",
    "mentions_coppa",
    "mentions_under_13",
    "mentions_under_16",
    "form_collects_birthdate",
    "date_of_birth_input_present"
  ].filter((flag) => packet.evidence?.flags?.includes(flag)).length;
  const strongMinorsContextEvidenceCount = [
    "age_gate_present",
    "kid_directed_content_detected",
    "parental_consent_reference_present",
    "form_collects_birthdate",
    "date_of_birth_input_present"
  ].filter((flag) => packet.evidence?.flags?.includes(flag)).length;
  const explicitMinorsCollectionFlagPresent = [
    "age_gate_present",
    "parental_consent_reference_present",
    "form_collects_birthdate",
    "date_of_birth_input_present"
  ].some((flag) => packet.evidence?.flags?.includes(flag));
  const childrenPrivacyRiskScore =
    typeof packet.evidence?.counts?.childrenPrivacyRiskScore === "number"
      ? packet.evidence.counts.childrenPrivacyRiskScore
      : null;
  const hasConcreteMinorsContextAttribution =
    packet.confidenceInputs.hasPageAttribution ||
    (packet.evidence?.pageUrls?.some((value) => typeof value === "string" && value.trim().length > 0) ?? false) ||
    (packet.evidence?.sourceUrls?.some((value) => typeof value === "string" && value.trim().length > 0) ?? false) ||
    (packet.evidence?.snippets?.some((value) => typeof value === "string" && value.trim().length > 0) ?? false);

  if (
    isDomainLevelSensitiveContext &&
    (
      explicitMinorsCollectionFlagPresent ||
      (hasConcreteMinorsContextAttribution &&
        strongMinorsContextEvidenceCount >= 1 &&
        (minorsContextEvidenceCount >= 2 || (childrenPrivacyRiskScore !== null && childrenPrivacyRiskScore >= 60)))
    )
  ) {
    return {
      confidenceRationale: buildConfidenceRationale(packet),
      rationale: "Surfaced because multiple youth-directed or age-related context cues make this domain-level privacy context worth reviewer attention.",
      status: "surface"
    };
  }

  if (
    isDomainLevelChildrenDisclosureContext &&
    packet.evidence?.flags?.includes("privacy.children_privacy_context_without_supporting_disclosure")
  ) {
    return {
      confidenceRationale: buildConfidenceRationale(packet),
      rationale: "Surfaced because youth-directed or age-related context was retained alongside missing privacy-supporting disclosure signals.",
      status: "surface"
    };
  }

  return null;
}

function getGenericAuditOnlyDecision(packet: UnifiedFindingPacket): UnifiedFindingPresentationDecision | null {
  const needsPageAttribution = packetNeedsPageAttribution({
    family: packet.details?.family,
    unifiedFindingId: packet.unifiedFindingId
  });

  if (
    needsPageAttribution &&
    !packet.confidenceInputs.hasPageAttribution &&
    !packet.confidenceInputs.hasKeyPageDiscoveryEvidence &&
    !packet.confidenceInputs.hasDirectRuntimeEvidence
  ) {
    return {
      confidenceRationale: buildConfidenceRationale(packet),
      rationale: "Kept for audit only because the current evidence does not yet identify concrete affected pages clearly enough for customer-facing surfacing.",
      status: "audit_only"
    };
  }

  if (packet.confidenceBand === "low" && packet.confidenceInputs.isFallbackOnly) {
    return {
      confidenceRationale: buildConfidenceRationale(packet),
      rationale: "Kept for audit only because the packet is fallback-only and the benefit of surfacing it broadly is limited right now.",
      status: "audit_only"
    };
  }

  if (
    packet.confidenceBand === "low" &&
    packet.confidenceInputs.sourceCount <= 1 &&
    !packet.confidenceInputs.hasDirectRuntimeEvidence &&
    !packet.confidenceInputs.hasStructuredValidationEvidence &&
    !packet.confidenceInputs.hasConcretePayloadEvidence
  ) {
    return {
      confidenceRationale: buildConfidenceRationale(packet),
      rationale: "Kept for audit only because evidence is still too thin for confident report surfacing.",
      status: "audit_only"
    };
  }

  return null;
}

function getConcernGatingDecision(packet: UnifiedFindingPacket): UnifiedFindingPresentationDecision | null {
  const concernExternalSurfacingEligibilities = packet.concernContext?.externalSurfacingEligibilities ?? [];
  const concernPromotionEligibilities = packet.concernContext?.promotionEligibilities ?? [];
  const hasConcernExternalEligibility = concernExternalSurfacingEligibilities.includes("eligible");
  const hasConcernAuditOnlyEligibility = concernExternalSurfacingEligibilities.includes("audit_only");
  const allConcernEligibilitiesAreSuppressed =
    concernExternalSurfacingEligibilities.length > 0 &&
    concernExternalSurfacingEligibilities.every((eligibility) => eligibility === "suppress");
  const allConcernPromotionsBlocked =
    concernPromotionEligibilities.length > 0 &&
    concernPromotionEligibilities.every((eligibility) => eligibility === "blocked");

  if (allConcernPromotionsBlocked || allConcernEligibilitiesAreSuppressed) {
    return {
      confidenceRationale: buildConfidenceRationale(packet),
      rationale: "Suppressed because normalized concern gating marked this concern as ineligible for external surfacing.",
      status: "suppress"
    };
  }

  if (!hasConcernExternalEligibility && hasConcernAuditOnlyEligibility) {
    return {
      confidenceRationale: buildConfidenceRationale(packet),
      rationale: "Kept for audit only because normalized concern gating retained it for internal review but not customer-facing surfacing.",
      status: "audit_only"
    };
  }

  return null;
}

function getArbitrationLocaleSuppressionDecision(packet: UnifiedFindingPacket): UnifiedFindingPresentationDecision | null {
  if (packet.unifiedFindingId !== "arbitration_clause_present") {
    return null;
  }

  const allUrls = [...(packet.evidence?.pageUrls ?? []), ...(packet.evidence?.sourceUrls ?? [])];
  const hasOnlyLocaleUrls = allUrls.length > 0 && allUrls.every((url) => isLikelyLocaleSubdomainUrl(url));

  if (!hasOnlyLocaleUrls) {
    return null;
  }

  return {
    confidenceRationale: buildConfidenceRationale(packet),
    rationale:
      "Suppressed because the retained arbitration evidence only points to a locale-specific alternate terms page and the scan did not retain canonical root-domain terms attribution for this clause.",
    status: "suppress"
  };
}

function getSpecializedPresentationDecision(input: {
  packet: UnifiedFindingPacket;
  siblingRows: UnifiedFindingPacket[];
}): UnifiedFindingPresentationDecision | null {
  return (
    getConcernGatingDecision(input.packet) ??
    getContradictionDecision(input) ??
    getPreconsentTrackingDecision(input.packet) ??
    getMinorsContextDecision(input.packet) ??
    getThinFinancialTransparencyDecision(input.packet) ??
    getCoverageSiblingSuppressionDecision(input) ??
    getPacketizedFindingEvidenceDecision(input.packet) ??
    getArbitrationLocaleSuppressionDecision(input.packet)
  );
}

function getSharedSupportSurfacingDecision(packet: UnifiedFindingPacket): UnifiedFindingPresentationDecision | null {
  const packetizedFindingSupportRule = getPacketizedFindingSupportRule(packet.unifiedFindingId);
  if (
    packetizedFindingSupportRule &&
    (packetizedFindingSupportRule.matchesLegacySource(packet) ||
      hasFamilyPacketFindingSource(packet, packet.unifiedFindingId))
  ) {
    return {
      confidenceRationale: buildConfidenceRationale(packet),
      rationale: packetizedFindingSupportRule.rationale,
      status: "surface"
    };
  }

  const policyEnrichmentFindingSupportRule = getPolicyEnrichmentFindingSupportRule(packet.unifiedFindingId);
  if (
    policyEnrichmentFindingSupportRule &&
    packet.sourceRefs.some(
      (sourceRef) =>
        sourceRef.kind === "signal" &&
        sourceRef.source === "policy_enrichment_signal" &&
        getPolicyPositiveSignalKeysForFinding(policyEnrichmentFindingSupportRule.findingId).includes(sourceRef.key)
    )
  ) {
    return {
      confidenceRationale: buildConfidenceRationale(packet),
      rationale: policyEnrichmentFindingSupportRule.rationale,
      status: "surface"
    };
  }

  const domainFlagFindingSupportRule = getDomainFlagFindingSupportRule(packet.unifiedFindingId);
  if (domainFlagFindingSupportRule && packet.evidence?.flags?.includes(domainFlagFindingSupportRule.evidenceFlag)) {
    return {
      confidenceRationale: buildConfidenceRationale(packet),
      rationale: domainFlagFindingSupportRule.rationale,
      status: "surface"
    };
  }

  return null;
}

function getLateFallbackPresentationDecision(packet: UnifiedFindingPacket): UnifiedFindingPresentationDecision | null {
  return (
    getUnavailableCoverageDecision(packet) ??
    getSpecificAuditOnlyEvidenceDecision(packet) ??
    getGenericAuditOnlyDecision(packet)
  );
}

function formatCoveragePageLabel(pageType: string | undefined) {
  switch (pageType) {
    case "privacy_policy":
      return "privacy policy";
    case "terms_of_service":
      return "terms page";
    case "cookie_policy":
      return "cookie policy";
    case "accessibility_statement":
      return "accessibility statement";
    case "contact_page":
      return "contact page";
    default:
      return "disclosure page";
  }
}

function buildConfidenceRationale(packet: UnifiedFindingPacket) {
  const positives: string[] = [];

  if (packet.confidenceInputs.hasDirectRuntimeEvidence) {
    positives.push("direct runtime evidence was captured");
  }
  if (packet.confidenceInputs.hasPolicyTextEvidence) {
    positives.push("policy or disclosure text contributed supporting context");
  }
  if (packet.confidenceInputs.hasStructuredValidationEvidence) {
    positives.push("structured validation evidence corroborated the concern");
  }
  if (packet.confidenceInputs.hasKeyPageDiscoveryEvidence) {
    positives.push("key-page discovery context narrowed the failure mode");
  }
  if (packet.confidenceInputs.hasConcretePayloadEvidence) {
    positives.push("concrete payload evidence strengthened the signal");
  }
  if (packet.confidenceInputs.sourceKinds.length > 1) {
    positives.push(`multiple source types (${packet.confidenceInputs.sourceKinds.join(", ")}) agreed`);
  }

  if (packet.confidenceBand === "high") {
    return positives.length > 0
      ? `High confidence because ${positives.slice(0, 3).join(", ")}.`
      : "High confidence because multiple strong sources pointed to the same concern.";
  }

  if (packet.confidenceBand === "moderate") {
    return positives.length > 0
      ? `Moderate confidence because ${positives.slice(0, 2).join(", ")}, but corroboration is still partial.`
      : "Moderate confidence because the concern is supported, but corroboration is still limited.";
  }

  if (packet.confidenceInputs.isFallbackOnly) {
    return "Low confidence because this packet is relying on fallback scan context without stronger corroborating evidence yet.";
  }

  return "Low confidence because the current evidence is limited or only weakly corroborated.";
}

const UNIFIED_FINDING_PRESENTATION_COPY_OVERRIDES: Record<
  string,
  Pick<CanonicalReviewFindingPresentation, "suggestedFix" | "whyThisMatters">
> = {
  preconsent_tracking: {
    suggestedFix: "Block non-essential trackers until consent is captured and verify the reject path suppresses them.",
    whyThisMatters: "Tracking before a clear user choice can undermine consent expectations and create immediate transparency risk."
  },
  consent_mechanism_absent: {
    suggestedFix: "Add a clear consent control surface before non-essential tracking starts, and make sure users can reject or manage that tracking without extra friction.",
    whyThisMatters: "If no consent controls are presented, users may not get a meaningful chance to manage non-essential tracking before it begins."
  },
  consent_surface_missing: {
    suggestedFix: "Add a visible consent banner, modal, or equivalent control surface before non-essential tracking starts, and make sure it lets users reject or manage tracking without extra friction.",
    whyThisMatters: "If there is no visible consent surface at all, users may never get a clear chance to understand or control non-essential tracking."
  },
  reject_did_not_reduce_tracking: {
    suggestedFix: "Review consent enforcement so a reject action actually suppresses the non-essential tracking vendors seen after rejection.",
    whyThisMatters: "If reject does not materially reduce tracking, the consent experience may not be honoring the choice it presents."
  },
  reject_did_not_reduce_third_party_cookies: {
    suggestedFix: "Review third-party cookie controls so reject meaningfully reduces non-essential cookie activity after the interaction completes.",
    whyThisMatters: "Persistent third-party cookies after reject can signal that consent controls are not enforcing the promised outcome."
  },
  gpc_signal_not_honored: {
    suggestedFix: "Honor browser-level opt-out preference signals by suppressing the non-essential tracking or cookie activity that still fired under GPC.",
    whyThisMatters: "If the site ignores a browser-level privacy preference signal, users may not get the choice outcome they expected."
  },
  weak_cookie_security_attributes: {
    suggestedFix: "Review the observed cookie set and tighten weak attributes such as missing Secure or HttpOnly flags and weak SameSite settings where appropriate.",
    whyThisMatters: "Weak cookie attributes can make it easier for cookies to be handled in less protective ways than expected."
  },
  session_replay_undisclosed: {
    suggestedFix: "Review replay tooling deployment and either disclose it clearly in privacy/cookie materials or disable it until disclosures are accurate.",
    whyThisMatters: "Undisclosed session replay can materially change how users understand monitoring on the site."
  },
  cookie_disclosure_gap: {
    suggestedFix: "Reconcile runtime cookie behavior with the cookie policy so the observed cookies, providers, and purposes are covered accurately.",
    whyThisMatters: "When runtime cookie activity outpaces the disclosure, users cannot easily understand what is actually being set and why."
  },
  privacy_contact_channel_missing: {
    suggestedFix: "Add a clearly labeled privacy contact path or request channel so people can reliably reach the site owner about privacy and rights-related questions.",
    whyThisMatters: "If there is no clear privacy contact path, people may struggle to ask questions or exercise privacy-related rights."
  },
  privacy_rights_path_present: {
    suggestedFix: "Keep the disclosed rights-request path current and easy to reach anywhere people look for privacy controls.",
    whyThisMatters: "A clear privacy-rights path makes it easier for people to understand how to request access, deletion, export, correction, or related privacy controls."
  },
  privacy_contact_path_present: {
    suggestedFix: "Keep the privacy contact path easy to find and make sure the listed email, form, or portal stays current.",
    whyThisMatters: "A clear privacy contact path makes it easier for people to ask privacy questions or reach the site owner about data-handling concerns."
  },
  privacy_policy_present: {
    suggestedFix: "Keep the privacy policy linked from stable footer, legal, or help surfaces and make sure the destination remains crawlable.",
    whyThisMatters: "A visible privacy policy surface helps users and reviewers find the site's core notice and data-handling disclosures."
  },
  terms_of_service_present: {
    suggestedFix: "Keep the terms surface stable and easy to reach from footer, legal, or help navigation.",
    whyThisMatters: "A visible terms surface helps users and reviewers locate the site's core legal and dispute-resolution terms."
  },
  cookie_policy_present: {
    suggestedFix: "Keep the cookie policy or cookie-settings surface easy to reach and make sure the linked destination remains crawlable.",
    whyThisMatters: "A visible cookie policy or settings surface helps users find tracking disclosures and related controls more reliably."
  },
  contact_support_path_present: {
    suggestedFix: "Keep the contact or feedback path easy to find and make sure the linked help channel remains current.",
    whyThisMatters: "A visible contact or feedback path gives people a clearer way to reach the operator when they need help or have questions."
  },
  targeted_advertising_choices_present: {
    suggestedFix: "Keep the targeted-advertising choice path easy to reach anywhere users would expect privacy or ad-preference controls.",
    whyThisMatters: "A visible targeted-advertising choice path helps users find sale, sharing, or ad-preference controls more reliably."
  },
  sale_sharing_controls_missing: {
    suggestedFix: "Add a clearly labeled do-not-sell/share or targeted-advertising control path wherever the site uses adtech patterns that may require that choice.",
    whyThisMatters: "If adtech or retargeting behavior is present but no sale/sharing control path is surfaced, people may not get the privacy choice they expect."
  },
  retargeting_pixel_observed: {
    suggestedFix: "Review the retained detector output and confirm whether the site deploys a specific retargeting or advertising pixel that needs follow-up disclosure, consent, or control review.",
    whyThisMatters: "A retargeting-related signal can indicate advertising or remarketing infrastructure, but detector-only evidence should be confirmed against retained runtime artifacts before treating it as a confirmed pixel deployment."
  },
  gpc_disclosure_present: {
    suggestedFix: "Keep the GPC disclosure aligned with actual enforcement behavior and any related sale, sharing, or targeted-advertising controls.",
    whyThisMatters: "A public GPC disclosure gives users and reviewers a clearer picture of how browser-level privacy preference signals are expected to be handled."
  },
  tracking_technologies_disclosure_present: {
    suggestedFix: "Keep the tracking-technologies disclosure specific about the cookies, pixels, tags, beacons, scripts, or similar technologies the site says it uses.",
    whyThisMatters: "Clear tracking-technologies disclosure helps people understand what kinds of tracking tools may be active and where to look for more detailed controls or explanations."
  },
  targeted_advertising_disclosure_present: {
    suggestedFix: "Keep the targeted-advertising disclosure specific about the technologies, purposes, and control paths users can rely on.",
    whyThisMatters: "Clear targeted-advertising disclosure helps users understand when sale, sharing, or ad-personalization practices may apply and where to find related controls."
  },
  third_party_advertising_disclosure_present: {
    suggestedFix: "Keep the third-party advertising disclosure specific about the ad partners, technologies, and where users can learn more about those practices.",
    whyThisMatters: "A clear third-party advertising disclosure helps users understand when outside ad partners or related technologies may be involved."
  },
  behavioral_analytics_disclosure_present: {
    suggestedFix: "Keep the behavioral-analytics disclosure aligned with the actual tooling, pages, and monitoring practices the site uses.",
    whyThisMatters: "A public disclosure about behavioral analytics or replay-style tooling helps users and reviewers understand when more detailed interaction monitoring may occur."
  },
  children_privacy_disclosure_present: {
    suggestedFix: "Keep the children's privacy disclosure easy to find and aligned with the site's current age-related practices and contact paths.",
    whyThisMatters: "A visible children's privacy disclosure helps users and reviewers understand how the site says it handles child- or youth-related privacy expectations."
  },
  accessibility_support_path_missing: {
    suggestedFix: "Add a clearly labeled accessibility support or accommodation contact path so people know how to request help or report access barriers.",
    whyThisMatters: "If there is no visible accessibility support path, people may not know how to ask for help when they hit an access barrier."
  },
  accessibility_support_path_present: {
    suggestedFix: "Keep the accessibility support path easy to find and make sure the linked contact or help channel remains current.",
    whyThisMatters: "A visible accessibility support path gives people a clearer way to request help, accommodations, or barrier remediation support."
  },
  arbitration_clause_present: {
    suggestedFix: "Keep arbitration and dispute-resolution terms easy to find and aligned with the latest legal text on the live terms page.",
    whyThisMatters: "A visible arbitration clause can materially affect how users understand dispute resolution and consumer remedies."
  },
  affiliate_disclosure_present: {
    suggestedFix: "Keep the affiliate disclosure easy to reach anywhere endorsements, recommendations, or affiliate-linked product references appear.",
    whyThisMatters: "A visible affiliate disclosure helps users understand when recommendations or links may carry a financial relationship."
  },
  legal_entity_name_present: {
    suggestedFix: "Keep the operating legal entity easy to identify on public-facing legal, about, or contact surfaces and make sure the retained text matches the live operator identity.",
    whyThisMatters: "A visible legal entity name helps users and reviewers understand who operates the site and who is accountable for the offer."
  },
  operator_contact_path_present: {
    suggestedFix: "Keep the operator contact path easy to find and make sure the listed email, form, phone, or support route remains current.",
    whyThisMatters: "A visible operator contact path helps users and reviewers understand how to reach the business behind the offer."
  },
  investment_risk_disclosure_present: {
    suggestedFix: "Keep investment-risk disclosures easy to find anywhere yield, return, or high-risk product claims appear, and make sure the language matches the live offer.",
    whyThisMatters: "A visible investment-risk disclosure helps users and reviewers understand when returns or financial-product claims are accompanied by meaningful cautionary context."
  },
  fee_disclosure_present: {
    suggestedFix: "Keep fee disclosures easy to find anywhere account, pricing, trading, lending, or managed-service costs are described, and make sure the retained text matches the live offer.",
    whyThisMatters: "A visible fee disclosure helps users and reviewers understand whether core costs are described alongside the financial or quasi-financial offer."
  },
  past_performance_disclaimer_present: {
    suggestedFix: "Keep past-performance disclaimers easy to find wherever historical returns, yield, or strategy results are shown, and make sure the language stays aligned with the live offer.",
    whyThisMatters: "A visible past-performance disclaimer helps users and reviewers understand that historical results may not predict future outcomes."
  },
  apr_or_interest_rate_disclosure_present: {
    suggestedFix: "Keep APR or interest-rate disclosures easy to find anywhere lending, savings, financing, or credit terms are promoted, and make sure the retained rate language matches the live offer.",
    whyThisMatters: "A visible APR or interest-rate disclosure helps users and reviewers understand when a financial offer includes concrete rate terms."
  },
  children_privacy_context_without_supporting_disclosure: {
    suggestedFix: "Add clear child- or youth-related privacy disclosure and a supporting privacy contact path wherever the site presents youth-directed cues or age-related collection context.",
    whyThisMatters: "If the site looks child-directed or collects age-related information without supporting privacy disclosure, users and reviewers may not be able to understand how those expectations are handled."
  },
  minors_or_age_gated_collection_context: {
    suggestedFix: "Review whether the site is collecting age-related or youth-directed data cues, and make sure any age-gate, parental-consent, or children’s privacy disclosures match the live experience.",
    whyThisMatters: "If the site looks youth-directed or collects age-related data, privacy expectations and regulatory scrutiny can rise quickly."
  },
  low_confidence_policy_extraction: {
    suggestedFix: "Simplify the policy surface or markup so core disclosures can be extracted and reviewed more reliably.",
    whyThisMatters: "Low-confidence extraction makes it harder to trust that important policy commitments were captured accurately."
  }
};

function buildPresentationCopy(
  packet: UnifiedFindingPacket,
  base: CanonicalReviewFindingPresentation
): CanonicalReviewFindingPresentation {
  if (packet.details?.family === "coverage_gap") {
    const pageLabel = formatCoveragePageLabel(packet.details.pageType);
    if (packet.details.gapKind === "fetch_failed") {
      return {
        ...base,
        suggestedFix: `Repair the ${pageLabel} URL or response path so the page loads reliably and remains crawlable.`,
        whyThisMatters: `If the ${pageLabel} appears to exist but cannot be retrieved, users and reviewers can hit a dead end when trying to verify disclosures.`
      };
    }

    if (packet.details.gapKind === "surface_missing") {
      return {
        ...base,
        suggestedFix: `Add a clear, stable entry point to the ${pageLabel} in footer or legal navigation and keep the destination crawlable.`,
        whyThisMatters: `If the ${pageLabel} is not clearly surfaced, people may struggle to discover the disclosure at all.`
      };
    }

    return {
      ...base,
      suggestedFix: `Expose the relevant ${pageLabel} through a stable crawlable path and verify bounded discovery can reliably reach it.`,
      whyThisMatters: `If key-page discovery stays unresolved, the scan cannot confidently confirm whether the ${pageLabel} is actually reachable.`
    };
  }
  const override = UNIFIED_FINDING_PRESENTATION_COPY_OVERRIDES[packet.unifiedFindingId];
  return override ? { ...base, ...override } : base;
}

function buildPresentationDecision(input: {
  packet: UnifiedFindingPacket;
  siblingRows: UnifiedFindingPacket[];
}): UnifiedFindingPresentationDecision {
  const specializedDecision = getSpecializedPresentationDecision(input);
  if (specializedDecision) {
    return specializedDecision;
  }

  const sharedSupportSurfacingDecision = getSharedSupportSurfacingDecision(input.packet);
  if (sharedSupportSurfacingDecision) {
    return sharedSupportSurfacingDecision;
  }

  const lateFallbackDecision = getLateFallbackPresentationDecision(input.packet);
  if (lateFallbackDecision) {
    return lateFallbackDecision;
  }

  return {
    confidenceRationale: buildConfidenceRationale(input.packet),
    rationale: "Surfaced because the evidence is specific enough to be useful in the main report.",
    status: "surface"
  };
}

function getSourceLabel(packet: UnifiedFindingPacket) {
  const sourceUrl = getSourceUrl(packet);
  if (!sourceUrl) {
    return undefined;
  }

  const lowered = sourceUrl.toLowerCase();
  if (lowered.includes("/terms")) {
    return "TOS";
  }
  if (lowered.includes("/privacy")) {
    return "Privacy Policy";
  }
  if (lowered.includes("/cookie")) {
    return "Cookie Policy";
  }
  if (lowered.includes("/refund")) {
    return "Refund Policy";
  }
  return "Source";
}

function selectPrimaryValidationFinding(findings: ScanValidationFinding[]) {
  return (
    [...findings].sort((left, right) => {
      const severityDelta =
        getSeverityWeight((right.severity as ReviewFindingSeverity | null | undefined) ?? "low") -
        getSeverityWeight((left.severity as ReviewFindingSeverity | null | undefined) ?? "low");
      if (severityDelta !== 0) {
        return severityDelta;
      }

      return (right.systemConfidenceScore ?? right.modelConfidence ?? -1) - (left.systemConfidenceScore ?? left.modelConfidence ?? -1);
    })[0] ?? null
  );
}

function resolveLinkedValidationFindingForPacket(
  packet: UnifiedFindingPacket,
  validationFindingLookup: Map<string, ScanValidationFinding>
) {
  return selectPrimaryValidationFinding(
    packet.sourceRefs
      .filter((sourceRef): sourceRef is Extract<typeof sourceRef, { kind: "validation" }> => sourceRef.kind === "validation")
      .flatMap((sourceRef) => {
        const matched = findValidationFindingForKeys(validationFindingLookup, [sourceRef.ruleKey]);
        return matched ? [matched] : [];
      })
  );
}

function buildCanonicalPresentationInput(
  packet: UnifiedFindingPacket,
  linkedValidationFinding: ScanValidationFinding | null
) {
  return {
    evidence: packet.evidence?.pageUrls ?? [],
    fallbackEvidence: {
      ...(packet.evidence ?? {}),
      normalizedConcernAssertionLevels: packet.concernContext?.assertionLevels ?? [],
      normalizedConcernMaxAssertionLevel:
        packet.concernContext?.assertionLevels?.includes("weak")
          ? "weak"
          : packet.concernContext?.assertionLevels?.includes("moderate")
            ? "moderate"
            : "strong",
      normalizedConcernNegativeEvidenceFlags: packet.concernContext?.negativeEvidenceFlags ?? [],
      summary: packet.summary,
      unifiedFindingId: packet.unifiedFindingId
    },
    linkedValidationFinding,
    observedValue: getBestObservedValue([packet.evidence?.snippets?.[0] ?? null, packet.summary]),
    severity: packet.severity,
    title: packet.title
  };
}

function buildCanonicalPresentationSiblingInput(packet: UnifiedFindingPacket) {
  return {
    evidence: packet.evidence?.pageUrls ?? [],
    fallbackEvidence: packet.evidence ?? null,
    linkedValidationFinding: null,
    observedValue: packet.summary,
    severity: packet.severity,
    title: packet.title
  };
}

function appendUniqueSourceRef(
  sourceRefs: UnifiedFindingPacket["sourceRefs"],
  nextSourceRef: UnifiedFindingPacket["sourceRefs"][number]
) {
  const alreadyPresent = sourceRefs.some((sourceRef) => {
    if (sourceRef.kind !== nextSourceRef.kind) {
      return false;
    }

    if (sourceRef.kind === "signal" && nextSourceRef.kind === "signal") {
      return sourceRef.source === nextSourceRef.source && sourceRef.key === nextSourceRef.key;
    }

    if (sourceRef.kind === "validation" && nextSourceRef.kind === "validation") {
      return sourceRef.ruleKey === nextSourceRef.ruleKey;
    }

    if (sourceRef.kind === "issue" && nextSourceRef.kind === "issue") {
      return sourceRef.title === nextSourceRef.title;
    }

    return false;
  });

  return alreadyPresent ? sourceRefs : [...sourceRefs, nextSourceRef];
}

function appendUniqueValidationFinding(
  findings: ScanValidationFinding[],
  nextFinding: ScanValidationFinding
) {
  return findings.some((finding) => finding.id === nextFinding.id || finding.ruleKey === nextFinding.ruleKey)
    ? findings
    : [...findings, nextFinding];
}

function getStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
    : [];
}

function getFindingFamilyPacketEvents(scanEvents?: UnifiedFindingScanEvent[]) {
  if (!Array.isArray(scanEvents) || scanEvents.length === 0) {
    return [] as Array<{ packets: FindingFamilyPacketRecord[] }>;
  }

  return scanEvents.flatMap((event) => {
    if (event.eventType !== "runtime.build_phase_diagnostic" || !event.metadataJson || typeof event.metadataJson !== "object") {
      return [];
    }

    const metadata = event.metadataJson as { phase?: unknown; packets?: unknown };
    if (metadata.phase !== "finding_family_packets") {
      return [];
    }

    return [
      {
        packets: Array.isArray(metadata.packets) ? (metadata.packets as FindingFamilyPacketRecord[]) : []
      }
    ];
  });
}

function getCanonicalTargetsForFamilyPacket(packet: FindingFamilyPacketRecord) {
  return Array.isArray(packet.canonicalTargets) ? (packet.canonicalTargets as FamilyPacketTargetRecord[]) : [];
}

function getSupportedUnifiedFindingsForFamilyPacket(packet: FindingFamilyPacketRecord) {
  return Array.isArray(packet.supportedUnifiedFindings)
    ? (packet.supportedUnifiedFindings as FamilyPacketFindingRecord[])
    : [];
}

function getMatchingFamilyPacketTargets(
  canonicalTargets: FamilyPacketTargetRecord[],
  sourceSurfaceTypes: string[]
) {
  return canonicalTargets.filter((target) => {
    const targetSurfaceTypes = getStringArray(target.supportedSurfaceTypes ?? target.sourceSurfaceTypes);
    return sourceSurfaceTypes.length === 0 || targetSurfaceTypes.some((surfaceType) => sourceSurfaceTypes.includes(surfaceType));
  });
}

function getFamilyPacketSourceUrls(targets: FamilyPacketTargetRecord[]) {
  return uniqueStrings(
    targets.flatMap((target) => {
      const refs = Array.isArray(target.supportingRefs) ? (target.supportingRefs as Array<Record<string, unknown>>) : [];
      return refs
        .map((ref) => (typeof ref.url === "string" ? ref.url : null))
        .filter((value): value is string => Boolean(value));
    })
  );
}

function getFamilyPacketPolicySnippets(targets: FamilyPacketTargetRecord[]) {
  return uniqueStrings([
    ...targets.flatMap((target) => [
      typeof target.title === "string" ? target.title : null,
      typeof target.snippet === "string" ? target.snippet : null
    ])
  ])
    .map((snippet) => normalizePolicySnippet(snippet))
    .filter((snippet): snippet is string => Boolean(snippet));
}

function buildFamilyPacketFallbackEvidence(input: {
  familyId: string;
  findingRecord: FamilyPacketFindingRecord;
  findingId: string;
  firstPageUrl: string | null;
  firstSnippet: string | null;
  pageUrls: string[];
  policyPageType: string | null;
  policySnippets: string[];
  sourceSurfaceTypes: string[];
  sourceUrls: string[];
  supportedUnifiedFindings: FamilyPacketFindingRecord[];
}) {
  const evidencePayload =
    input.findingRecord.evidencePayload && typeof input.findingRecord.evidencePayload === "object"
      ? (input.findingRecord.evidencePayload as Record<string, unknown>)
      : {};

  return {
    ...evidencePayload,
    familyPacketCanonicalUrl: input.firstPageUrl,
    familyPacketFamilyId: input.familyId,
    familyPacketFindingId: input.findingId,
    familyPacketSourceSurfaceTypes: input.sourceSurfaceTypes,
    familyPacketSourceUrls: input.sourceUrls,
    familyPacketSupportedFindings: input.supportedUnifiedFindings
      .map((entry) => (typeof entry.findingId === "string" ? entry.findingId : null))
      .filter((value): value is string => Boolean(value)),
    familyPacketVerified: true,
    pageUrl: input.firstPageUrl,
    pageUrls: input.pageUrls,
    policyIsPrimarySource: true,
    policyPageType: input.policyPageType,
    policySnippets: input.policySnippets,
    policySummaryShort: input.firstSnippet,
    sourceUrl: input.sourceUrls[0] ?? input.firstPageUrl,
    sourceUrls: input.sourceUrls
  };
}

function createInitialUnifiedFindingPacket(
  definition: ReturnType<typeof getReportUnifiedFinding>,
  candidate: ConcernBackedUnifiedFindingCandidate
): UnifiedFindingPacket {
  return {
    unifiedFindingId: definition.id,
    title: definition.label,
    severity: candidate.severity,
    summary: candidate.description,
    confidenceBand: "low",
    primaryPageUrl: null,
    affectedPageCount: 0,
    confidenceInputs: {
      evidenceQualityFlags: [],
      hasConcretePayloadEvidence: false,
      hasDirectRuntimeEvidence: false,
      hasKeyPageDiscoveryEvidence: false,
      hasPageAttribution: false,
      hasPolicyTextEvidence: false,
      hasStructuredValidationEvidence: false,
      isFallbackOnly: false,
      issueCount: 0,
      signalCount: 0,
      sourceCount: 0,
      sourceKinds: [],
      validationCount: 0
    },
    categoryAlignments: definition.categoryAlignments,
    sourceRefs: [],
    evidence: undefined,
    details: undefined,
    concernContext: {
      assertionLevels: [],
      evidenceStrengthFlags: [],
      externalSurfacingEligibilities: [],
      negativeEvidenceFlags: [],
      originTypes: [],
      promotionEligibilities: []
    }
  };
}

function appendCandidateSourceRef(
  packet: UnifiedFindingPacket,
  candidate: ConcernBackedUnifiedFindingCandidate
) {
  if (candidate.sourceType === "signal" && candidate.signalSource && candidate.signalKey) {
    return appendUniqueSourceRef(packet.sourceRefs, {
      kind: "signal",
      key: candidate.signalKey,
      label: candidate.signalLabel,
      source: candidate.signalSource
    });
  }

  return appendUniqueSourceRef(packet.sourceRefs, { kind: "issue", title: candidate.title });
}

function mergeConcernContext(
  existing: UnifiedFindingPacket["concernContext"] | undefined,
  candidate: ConcernBackedUnifiedFindingCandidate
): UnifiedFindingPacket["concernContext"] {
  return {
    assertionLevels: uniqueConcernFlags([
      ...(existing?.assertionLevels ?? []),
      ...(candidate.normalizedConcern ? [candidate.normalizedConcern.allowedNarrativeTier] : [])
    ]),
    evidenceStrengthFlags: uniqueConcernFlags([
      ...(existing?.evidenceStrengthFlags ?? []),
      ...(candidate.normalizedConcern?.evidenceStrengthFlags ?? [])
    ]),
    externalSurfacingEligibilities: uniqueConcernFlags([
      ...(existing?.externalSurfacingEligibilities ?? []),
      ...(candidate.normalizedConcern ? [candidate.normalizedConcern.externalSurfacingEligibility] : [])
    ]),
    negativeEvidenceFlags: uniqueConcernFlags([
      ...(existing?.negativeEvidenceFlags ?? []),
      ...(candidate.normalizedConcern?.negativeEvidenceFlags ?? [])
    ]),
    originTypes: uniqueConcernFlags([
      ...(existing?.originTypes ?? []),
      ...(candidate.normalizedConcern ? [candidate.normalizedConcern.originType] : [])
    ]),
    promotionEligibilities: uniqueConcernFlags([
      ...(existing?.promotionEligibilities ?? []),
      ...(candidate.normalizedConcern ? [candidate.normalizedConcern.promotionEligibility] : [])
    ])
  };
}

function finalizeUnifiedFindingPacket(input: {
  candidate: ConcernBackedUnifiedFindingCandidate;
  fallbackEvidence: ReturnType<typeof extractEvidenceFromFallback>;
  fallbackEvidenceRows: Array<Record<string, unknown> | null | undefined>;
  findingId: string;
  linkedValidationFinding?: ScanValidationFinding | null;
  packet: UnifiedFindingPacket;
  validationFindings: ScanValidationFinding[];
}) {
  input.packet.evidence = mergeEvidence(
    input.packet.evidence,
    input.fallbackEvidence,
    input.candidate.evidence,
    input.linkedValidationFinding
  );
  input.packet.evidence = sanitizeEvidenceForFinding(input.findingId, input.packet.evidence);

  const attributedUrls = uniqueStrings([
    ...(input.packet.evidence?.pageUrls ?? []),
    ...(input.packet.evidence?.sourceUrls ?? []),
    input.linkedValidationFinding?.pageUrl ?? null
  ]);

  input.packet.primaryPageUrl = attributedUrls[0] ?? null;
  input.packet.affectedPageCount = attributedUrls.length;
  input.packet.details = buildUnifiedFindingDetails({
    fallbackEvidence: input.candidate.fallbackEvidence ?? null,
    findingId: input.findingId,
    linkedValidationFinding: input.linkedValidationFinding,
    observedValue: input.candidate.observedValue,
    summary: input.candidate.description
  });
  input.packet.confidenceInputs = deriveConfidenceInputs({
    fallbackEvidenceRows: input.fallbackEvidenceRows,
    packet: input.packet,
    validationFindings: input.validationFindings
  });
  input.packet.confidenceBand = deriveConfidenceBand(input.packet.confidenceInputs, input.packet.severity);
}

function getFamilyPacketReviewFindingCandidates(scanEvents?: UnifiedFindingScanEvent[]) {
  const packetEvents = getFindingFamilyPacketEvents(scanEvents);
  if (packetEvents.length === 0) {
    return [] as UnifiedFindingCandidate[];
  }

  const candidates: UnifiedFindingCandidate[] = [];

  for (const event of packetEvents) {
    const packets = event.packets;

    for (const packet of packets) {
      const familyId = typeof packet.familyId === "string" ? packet.familyId : null;
      if (!familyId) {
        continue;
      }

      const canonicalTargets = getCanonicalTargetsForFamilyPacket(packet);
      const supportedUnifiedFindings = getSupportedUnifiedFindingsForFamilyPacket(packet);

      for (const finding of supportedUnifiedFindings) {
        const findingId = typeof finding.findingId === "string" ? finding.findingId : null;
        const definition = findingId ? getReportUnifiedFinding(findingId) : null;
        const packetizedSupportRule = findingId ? getPacketizedFindingSupportRule(findingId) : null;
        if (!definition || !packetizedSupportRule) {
          continue;
        }

        const sourceSurfaceTypes = getStringArray(finding.sourceSurfaceTypes);
        const matchingTargets = getMatchingFamilyPacketTargets(canonicalTargets, sourceSurfaceTypes);

        const pageUrls = uniqueStrings([
          ...getStringArray(finding.evidenceUrls),
          ...matchingTargets.flatMap((target) => (typeof target.canonicalUrl === "string" ? [target.canonicalUrl] : []))
        ]);
        const sourceUrls = getFamilyPacketSourceUrls(matchingTargets);
        const policySnippets = getFamilyPacketPolicySnippets(matchingTargets);

        const firstPageUrl = pageUrls[0] ?? null;
        const firstSnippet = policySnippets[0] ?? null;
        const policyPageType = getPacketizedPolicyPageType(findingId);

        candidates.push({
          categoryId: undefined,
          description:
            typeof finding.reason === "string" && finding.reason.trim().length > 0 ? finding.reason : definition.label,
          evidence: uniqueStrings([...pageUrls, ...sourceUrls]),
          fallbackEvidence: buildFamilyPacketFallbackEvidence({
            familyId,
            findingRecord: finding,
            findingId,
            firstPageUrl,
            firstSnippet,
            pageUrls,
            policyPageType,
            policySnippets,
            sourceSurfaceTypes,
            sourceUrls,
            supportedUnifiedFindings
          }),
          linkedValidationFinding: null,
          observedValue: firstSnippet,
          severity: "medium",
          sourceType: "issue",
          title: definition.label
        });
      }
    }
  }

  return candidates;
}

function resolveUnifiedFindingIdForCandidate(candidate: UnifiedFindingCandidate) {
  const familyPacketFindingId =
    typeof candidate.fallbackEvidence?.familyPacketFindingId === "string"
      ? getReportUnifiedFinding(candidate.fallbackEvidence.familyPacketFindingId)
      : null;
  if (familyPacketFindingId) {
    return familyPacketFindingId.id;
  }

  return candidate.sourceType === "signal" && candidate.signalSource && candidate.signalKey
    ? getReportUnifiedFindingForSignal(candidate.signalSource, candidate.signalKey)?.id ??
        getReportUnifiedFindingByAlias(candidate.title)?.id ??
        null
    : getReportUnifiedFindingByAlias(candidate.title)?.id ??
        (candidate.linkedValidationFinding
          ? getReportUnifiedFindingForValidationRule(candidate.linkedValidationFinding.ruleKey)?.id ?? null
          : null);
}

function resolveUnifiedFindingForCandidate(candidate: UnifiedFindingCandidate) {
  const findingId =
    candidate.normalizedConcern?.suggestedUnifiedFindingId ?? resolveUnifiedFindingIdForCandidate(candidate);

  return findingId ? getReportUnifiedFinding(findingId) : null;
}

export function buildUnifiedFindingPackets(input: {
  reviewFindingCandidates: UnifiedFindingCandidate[];
  scanEvents?: UnifiedFindingScanEvent[];
  validationFindings: ScanValidationFinding[];
}) {
  const familyPacketCandidates = getFamilyPacketReviewFindingCandidates(input.scanEvents);
  const packetBackedFindingIds = new Set(
    familyPacketCandidates
      .map((candidate) => resolveUnifiedFindingIdForCandidate(candidate))
      .filter((value): value is string => Boolean(value))
  );
  const reviewFindingCandidates = input.reviewFindingCandidates.filter((candidate) => {
    const findingId = resolveUnifiedFindingIdForCandidate(candidate);
    return !findingId || !packetBackedFindingIds.has(findingId);
  });
  const normalizedConcerns = buildNormalizedConcerns({
    reviewFindingCandidates: [...reviewFindingCandidates, ...familyPacketCandidates],
    validationFindings: input.validationFindings
  });
  const normalizedCandidates = buildUnifiedFindingCandidatesFromConcerns(normalizedConcerns);
  const packets = new Map<string, UnifiedFindingPacket>();
  const validationByPacket = new Map<string, ScanValidationFinding[]>();
  const fallbackEvidenceByPacket = new Map<string, Array<Record<string, unknown> | null | undefined>>();

  const addCandidate = (
    findingId: string,
    candidate: ConcernBackedUnifiedFindingCandidate,
    linkedValidationFinding?: ScanValidationFinding | null
  ) => {
    const definition = getReportUnifiedFinding(findingId);
    if (!definition) {
      return;
    }

    const existing = packets.get(findingId);
    const fallbackEvidence = extractEvidenceFromFallback(candidate.fallbackEvidence ?? null);
    const nextPacket: UnifiedFindingPacket = existing ?? createInitialUnifiedFindingPacket(definition, candidate);

    nextPacket.severity = maxSeverity(nextPacket.severity, candidate.severity);
    if (!existing || nextPacket.summary.trim().length === 0) {
      nextPacket.summary = candidate.description;
    }

    nextPacket.sourceRefs = appendCandidateSourceRef(nextPacket, candidate);

    if (linkedValidationFinding) {
      nextPacket.sourceRefs = appendUniqueSourceRef(nextPacket.sourceRefs, {
        kind: "validation",
        ruleKey: linkedValidationFinding.ruleKey,
        title: linkedValidationFinding.title
      });
      validationByPacket.set(
        findingId,
        appendUniqueValidationFinding(validationByPacket.get(findingId) ?? [], linkedValidationFinding)
      );
    }

    fallbackEvidenceByPacket.set(findingId, [
      ...(fallbackEvidenceByPacket.get(findingId) ?? []),
      candidate.fallbackEvidence
    ]);
    nextPacket.concernContext = mergeConcernContext(existing?.concernContext, candidate);
    finalizeUnifiedFindingPacket({
      candidate,
      fallbackEvidence,
      fallbackEvidenceRows: fallbackEvidenceByPacket.get(findingId) ?? [],
      findingId,
      linkedValidationFinding,
      packet: nextPacket,
      validationFindings: validationByPacket.get(findingId) ?? []
    });
    packets.set(findingId, nextPacket);
  };

  for (const candidate of normalizedCandidates) {
    const mappedFinding = resolveUnifiedFindingForCandidate(candidate);

    if (!mappedFinding) {
      continue;
    }

    addCandidate(mappedFinding.id, candidate, candidate.linkedValidationFinding ?? null);
  }

  return [...packets.values()].sort(
    (left, right) =>
      getSeverityWeight(right.severity) - getSeverityWeight(left.severity) || left.title.localeCompare(right.title)
  );
}

export function buildUnifiedFindingDisplayPackets(input: {
  reviewFindingCandidates: UnifiedFindingCandidate[];
  scanEvents?: UnifiedFindingScanEvent[];
  validationFindings: ScanValidationFinding[];
  validationFindingLookup: Map<string, ScanValidationFinding>;
}) {
  const packets = buildUnifiedFindingPackets({
    reviewFindingCandidates: input.reviewFindingCandidates,
    scanEvents: input.scanEvents,
    validationFindings: input.validationFindings
  });

  return packets.map((packet, _index, rows): UnifiedFindingDisplayPacket => {
    const linkedValidationFinding = resolveLinkedValidationFindingForPacket(packet, input.validationFindingLookup);

    const siblingRows = rows.filter((row) => row.unifiedFindingId !== packet.unifiedFindingId);
    const presentation = buildCanonicalReviewFindingPresentation(
      buildCanonicalPresentationInput(packet, linkedValidationFinding),
      siblingRows.map((row) => buildCanonicalPresentationSiblingInput(row))
    );
    const presentationDecision = buildPresentationDecision({
      packet,
      siblingRows: siblingRows
    });
    const resolvedPresentation = buildPresentationCopy(packet, presentation);
    const observedValue = selectObservedValue(packet);

    return {
      ...packet,
      linkedValidationFinding,
      observedValue,
      presentationDecision,
      presentation: {
        ...resolvedPresentation,
        findingName: normalizeFindingName(packet.title)
      },
      referenceLabel: resolvedPresentation.suggestedBestPractice?.label,
      referenceUrl: resolvedPresentation.suggestedBestPractice?.url,
      sourceLabel: getSourceLabel(packet),
      sourceUrl: getSourceUrl(packet)
    };
  });
}

export function getUnifiedFindingOwnerCategoryId(packet: UnifiedFindingPacket) {
  return packet.categoryAlignments.find((alignment) => alignment.relation === "owner")?.evidenceCategoryId ?? null;
}

export function getUnifiedFindingCategoryRelation(packet: UnifiedFindingPacket, categoryId: string) {
  return packet.categoryAlignments.find((alignment) => alignment.evidenceCategoryId === categoryId)?.relation ?? null;
}
