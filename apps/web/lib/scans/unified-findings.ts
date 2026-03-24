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
    const vendors = uniqueStrings([
      ...(Array.isArray(input.linkedValidationFinding?.evidence?.runtimeVendors)
        ? (input.linkedValidationFinding?.evidence?.runtimeVendors as string[])
        : []),
      ...(Array.isArray(input.linkedValidationFinding?.evidence?.relatedVendors)
        ? (input.linkedValidationFinding?.evidence?.relatedVendors as string[])
        : []),
      ...(Array.isArray(input.fallbackEvidence?.runtimeVendors)
        ? (input.fallbackEvidence?.runtimeVendors as string[])
        : []),
      ...(Array.isArray(input.fallbackEvidence?.relatedVendors)
        ? (input.fallbackEvidence?.relatedVendors as string[])
        : [])
    ]);

    return {
      family,
      kind: input.findingId,
      claim:
        typeof input.linkedValidationFinding?.evidence?.claim === "string"
          ? input.linkedValidationFinding.evidence.claim
          : typeof input.fallbackEvidence?.claim === "string"
            ? input.fallbackEvidence.claim
            : null,
      observedBehavior: input.summary,
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

  const pageUrls = uniqueStrings([
    ...(Array.isArray(fallbackEvidence.pageUrls) ? (fallbackEvidence.pageUrls as string[]) : []),
    ...(Array.isArray(fallbackEvidence.keyPageAttemptedUrls) ? (fallbackEvidence.keyPageAttemptedUrls as string[]) : []),
    typeof fallbackEvidence.pageUrl === "string" ? fallbackEvidence.pageUrl : null,
    typeof fallbackEvidence.consentBlockerUrl === "string" ? fallbackEvidence.consentBlockerUrl : null
  ]);

  const sourceUrls = uniqueStrings([
    ...(Array.isArray(fallbackEvidence.sourceUrls) ? (fallbackEvidence.sourceUrls as string[]) : []),
    ...(Array.isArray(fallbackEvidence.keyPageAttemptedUrls) ? (fallbackEvidence.keyPageAttemptedUrls as string[]) : []),
    typeof fallbackEvidence.sourceUrl === "string" ? fallbackEvidence.sourceUrl : null,
    typeof fallbackEvidence.pageUrl === "string" ? fallbackEvidence.pageUrl : null
  ]);

  const snippets = uniqueStrings([
    typeof fallbackEvidence.consentBlockerTextSnippet === "string" ? fallbackEvidence.consentBlockerTextSnippet : null,
    typeof fallbackEvidence.policyChildrenReference === "string" ? fallbackEvidence.policyChildrenReference : null,
    Array.isArray(fallbackEvidence.policySnippets) && fallbackEvidence.policySnippets.length > 0
      ? null
      : typeof fallbackEvidence.policySummaryShort === "string"
        ? fallbackEvidence.policySummaryShort
        : null,
    ...(Array.isArray(fallbackEvidence.policySnippets) ? (fallbackEvidence.policySnippets as string[]) : []),
    Array.isArray(fallbackEvidence.policySnippets) && fallbackEvidence.policySnippets.length > 0
      ? null
      : typeof fallbackEvidence.signalValue === "string"
        ? fallbackEvidence.signalValue
        : null
  ]).map((snippet) => normalizeFallbackSnippet(snippet)).filter((snippet): snippet is string => Boolean(snippet));

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
  if (Array.isArray(fallbackEvidence.runtimeVendors)) {
    entities.runtimeVendors = uniqueStrings(fallbackEvidence.runtimeVendors as string[]);
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
    typeof fallbackEvidence.signalKey === "string" ? fallbackEvidence.signalKey : null
  ]);

  return { counts, entities, flags, pageUrls, snippets, sourceUrls };
}

function normalizeFallbackSnippet(snippet: string) {
  const collapsed = snippet.replace(/\s+/g, " ").trim();
  if (!collapsed) {
    return null;
  }

  const anchorPhrases = [
    "On certain pages",
    "We collect and receive",
    "The right to",
    "These Terms of Use",
    "Dispute Resolution; Arbitration Agreement",
    "including the right to opt out"
  ] as const;
  const anchored = anchorPhrases.reduce((current, phrase) => {
    const index = current.indexOf(phrase);
    return index > 0 ? current.slice(index).trim() : current;
  }, collapsed);

  const firstToken = anchored.match(/^\S+/)?.[0] ?? "";
  const shouldTrimLeadingFragment =
    /^[a-z]/.test(anchored) &&
    (
      firstToken.length <= 2 ||
      /[-,;:]/.test(firstToken)
    );

  if (shouldTrimLeadingFragment) {
    const trimmed = anchored.slice(firstToken.length).trim();
    if (trimmed.length > 0) {
      return trimmed;
    }
  }

  return anchored;
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
      } else if (/claim|observed|summary|snippet|evidence|description|rationale/i.test(key)) {
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
      for (const entry of stringValues.slice(0, 5)) {
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
    ...(candidateEvidence ?? []).filter((entry) => !/^https?:\/\//i.test(entry.trim())).slice(0, 2)
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

function getSourceUrl(packet: UnifiedFindingPacket) {
  return packet.primaryPageUrl ?? packet.evidence?.pageUrls?.[0] ?? packet.evidence?.sourceUrls?.[0];
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
    validationEvidenceRows.some((row) =>
      Object.keys(row).some((key) => /runtime|request|network|tracker/i.test(key))
    );

  const hasPolicyTextEvidence = normalizedConcernStrengthFlags.includes("policy_text") || allEvidenceRows.some((row) =>
    Object.keys(row).some((key) => /claim|policy|disclosure|summary|snippet|description|pageurl|page_url/i.test(key))
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

  switch (packet.unifiedFindingId) {
    case "preconsent_tracking":
      return {
        ...base,
        suggestedFix: "Block non-essential trackers until consent is captured and verify the reject path suppresses them.",
        whyThisMatters: "Tracking before a clear user choice can undermine consent expectations and create immediate transparency risk."
      };
    case "consent_mechanism_absent":
      return {
        ...base,
        suggestedFix: "Add a clear consent control surface before non-essential tracking starts, and make sure users can reject or manage that tracking without extra friction.",
        whyThisMatters: "If no consent controls are presented, users may not get a meaningful chance to manage non-essential tracking before it begins."
      };
    case "consent_surface_missing":
      return {
        ...base,
        suggestedFix: "Add a visible consent banner, modal, or equivalent control surface before non-essential tracking starts, and make sure it lets users reject or manage tracking without extra friction.",
        whyThisMatters: "If there is no visible consent surface at all, users may never get a clear chance to understand or control non-essential tracking."
      };
    case "reject_did_not_reduce_tracking":
      return {
        ...base,
        suggestedFix: "Review consent enforcement so a reject action actually suppresses the non-essential tracking vendors seen after rejection.",
        whyThisMatters: "If reject does not materially reduce tracking, the consent experience may not be honoring the choice it presents."
      };
    case "reject_did_not_reduce_third_party_cookies":
      return {
        ...base,
        suggestedFix: "Review third-party cookie controls so reject meaningfully reduces non-essential cookie activity after the interaction completes.",
        whyThisMatters: "Persistent third-party cookies after reject can signal that consent controls are not enforcing the promised outcome."
      };
    case "gpc_signal_not_honored":
      return {
        ...base,
        suggestedFix: "Honor browser-level opt-out preference signals by suppressing the non-essential tracking or cookie activity that still fired under GPC.",
        whyThisMatters: "If the site ignores a browser-level privacy preference signal, users may not get the choice outcome they expected."
      };
    case "weak_cookie_security_attributes":
      return {
        ...base,
        suggestedFix: "Review the observed cookie set and tighten weak attributes such as missing Secure or HttpOnly flags and weak SameSite settings where appropriate.",
        whyThisMatters: "Weak cookie attributes can make it easier for cookies to be handled in less protective ways than expected."
      };
    case "session_replay_undisclosed":
      return {
        ...base,
        suggestedFix: "Review replay tooling deployment and either disclose it clearly in privacy/cookie materials or disable it until disclosures are accurate.",
        whyThisMatters: "Undisclosed session replay can materially change how users understand monitoring on the site."
      };
    case "cookie_disclosure_gap":
      return {
        ...base,
        suggestedFix: "Reconcile runtime cookie behavior with the cookie policy so the observed cookies, providers, and purposes are covered accurately.",
        whyThisMatters: "When runtime cookie activity outpaces the disclosure, users cannot easily understand what is actually being set and why."
      };
    case "privacy_contact_channel_missing":
      return {
        ...base,
        suggestedFix: "Add a clearly labeled privacy contact path or request channel so people can reliably reach the site owner about privacy and rights-related questions.",
        whyThisMatters: "If there is no clear privacy contact path, people may struggle to ask questions or exercise privacy-related rights."
      };
    case "privacy_rights_path_present":
      return {
        ...base,
        suggestedFix: "Keep the disclosed rights-request path current and easy to reach anywhere people look for privacy controls.",
        whyThisMatters: "A clear privacy-rights path makes it easier for people to understand how to request access, deletion, export, correction, or related privacy controls."
      };
    case "sale_sharing_controls_missing":
      return {
        ...base,
        suggestedFix: "Add a clearly labeled do-not-sell/share or targeted-advertising control path wherever the site uses adtech patterns that may require that choice.",
        whyThisMatters: "If adtech or retargeting behavior is present but no sale/sharing control path is surfaced, people may not get the privacy choice they expect."
      };
    case "gpc_disclosure_present":
      return {
        ...base,
        suggestedFix: "Keep the GPC disclosure aligned with actual enforcement behavior and any related sale, sharing, or targeted-advertising controls.",
        whyThisMatters: "A public GPC disclosure gives users and reviewers a clearer picture of how browser-level privacy preference signals are expected to be handled."
      };
    case "tracking_technologies_disclosure_present":
      return {
        ...base,
        suggestedFix: "Keep the tracking-technologies disclosure specific about the cookies, pixels, tags, beacons, scripts, or similar technologies the site says it uses.",
        whyThisMatters: "Clear tracking-technologies disclosure helps people understand what kinds of tracking tools may be active and where to look for more detailed controls or explanations."
      };
    case "targeted_advertising_disclosure_present":
      return {
        ...base,
        suggestedFix: "Keep the targeted-advertising disclosure specific about the technologies, purposes, and control paths users can rely on.",
        whyThisMatters: "Clear targeted-advertising disclosure helps users understand when sale, sharing, or ad-personalization practices may apply and where to find related controls."
      };
    case "behavioral_analytics_disclosure_present":
      return {
        ...base,
        suggestedFix: "Keep the behavioral-analytics disclosure aligned with the actual tooling, pages, and monitoring practices the site uses.",
        whyThisMatters: "A public disclosure about behavioral analytics or replay-style tooling helps users and reviewers understand when more detailed interaction monitoring may occur."
      };
    case "accessibility_support_path_missing":
      return {
        ...base,
        suggestedFix: "Add a clearly labeled accessibility support or accommodation contact path so people know how to request help or report access barriers.",
        whyThisMatters: "If there is no visible accessibility support path, people may not know how to ask for help when they hit an access barrier."
      };
    case "accessibility_support_path_present":
      return {
        ...base,
        suggestedFix: "Keep the accessibility support path easy to find and make sure the linked contact or help channel remains current.",
        whyThisMatters: "A visible accessibility support path gives people a clearer way to request help, accommodations, or barrier remediation support."
      };
    case "arbitration_clause_present":
      return {
        ...base,
        suggestedFix: "Keep arbitration and dispute-resolution terms easy to find and aligned with the latest legal text on the live terms page.",
        whyThisMatters: "A visible arbitration clause can materially affect how users understand dispute resolution and consumer remedies."
      };
    case "children_privacy_context_without_supporting_disclosure":
      return {
        ...base,
        suggestedFix: "Add clear child- or youth-related privacy disclosure and a supporting privacy contact path wherever the site presents youth-directed cues or age-related collection context.",
        whyThisMatters: "If the site looks child-directed or collects age-related information without supporting privacy disclosure, users and reviewers may not be able to understand how those expectations are handled."
      };
    case "minors_or_age_gated_collection_context":
      return {
        ...base,
        suggestedFix: "Review whether the site is collecting age-related or youth-directed data cues, and make sure any age-gate, parental-consent, or children’s privacy disclosures match the live experience.",
        whyThisMatters: "If the site looks youth-directed or collects age-related data, privacy expectations and regulatory scrutiny can rise quickly."
      };
    case "low_confidence_policy_extraction":
      return {
        ...base,
        suggestedFix: "Simplify the policy surface or markup so core disclosures can be extracted and reviewed more reliably.",
        whyThisMatters: "Low-confidence extraction makes it harder to trust that important policy commitments were captured accurately."
      };
    default:
      return base;
  }
}

function buildPresentationDecision(input: {
  packet: UnifiedFindingPacket;
  siblingRows: UnifiedFindingPacket[];
}): UnifiedFindingPresentationDecision {
  const concernExternalSurfacingEligibilities = input.packet.concernContext?.externalSurfacingEligibilities ?? [];
  const concernPromotionEligibilities = input.packet.concernContext?.promotionEligibilities ?? [];
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
      confidenceRationale: buildConfidenceRationale(input.packet),
      rationale: "Suppressed because normalized concern gating marked this concern as ineligible for external surfacing.",
      status: "suppress"
    };
  }

  if (!hasConcernExternalEligibility && hasConcernAuditOnlyEligibility) {
    return {
      confidenceRationale: buildConfidenceRationale(input.packet),
      rationale: "Kept for audit only because normalized concern gating retained it for internal review but not customer-facing surfacing.",
      status: "audit_only"
    };
  }

  const isDomainLevelSensitiveContext = isDomainLevelSensitiveContextFinding(input.packet.unifiedFindingId);
  const isDomainLevelChildrenDisclosureContext =
    isDomainLevelChildrenDisclosureFinding(input.packet.unifiedFindingId);
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
  ].filter((flag) => input.packet.evidence?.flags?.includes(flag)).length;
  const strongMinorsContextEvidenceCount = [
    "age_gate_present",
    "kid_directed_content_detected",
    "parental_consent_reference_present",
    "form_collects_birthdate",
    "date_of_birth_input_present"
  ].filter((flag) => input.packet.evidence?.flags?.includes(flag)).length;
  const explicitMinorsCollectionFlagPresent = [
    "age_gate_present",
    "parental_consent_reference_present",
    "form_collects_birthdate",
    "date_of_birth_input_present"
  ].some((flag) => input.packet.evidence?.flags?.includes(flag));
  const childrenPrivacyRiskScore =
    typeof input.packet.evidence?.counts?.childrenPrivacyRiskScore === "number"
      ? input.packet.evidence.counts.childrenPrivacyRiskScore
      : null;
  const needsPageAttribution = packetNeedsPageAttribution({
    family: input.packet.details?.family,
    unifiedFindingId: input.packet.unifiedFindingId
  });

  if (
    input.packet.unifiedFindingId === "policy_behavior_conflict" &&
    input.siblingRows.some(
      (row) => SPECIFIC_CONTRADICTION_FINDING_IDS.has(row.unifiedFindingId)
    )
  ) {
    return {
      confidenceRationale: buildConfidenceRationale(input.packet),
      rationale: "Suppressed because a more specific contradiction finding already explains this concern.",
      status: "suppress"
    };
  }

  if (
    input.packet.unifiedFindingId === "consent_gated_tracking_claim_conflict"
  ) {
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

  if (
    isDomainLevelSensitiveContext &&
    (
      explicitMinorsCollectionFlagPresent ||
      (strongMinorsContextEvidenceCount >= 1 &&
        (minorsContextEvidenceCount >= 2 || (childrenPrivacyRiskScore !== null && childrenPrivacyRiskScore >= 60)))
    )
  ) {
    return {
      confidenceRationale: buildConfidenceRationale(input.packet),
      rationale: "Surfaced because multiple youth-directed or age-related context cues make this domain-level privacy context worth reviewer attention.",
      status: "surface"
    };
  }

  if (
    isDomainLevelChildrenDisclosureContext &&
    input.packet.evidence?.flags?.includes("privacy.children_privacy_context_without_supporting_disclosure")
  ) {
    return {
      confidenceRationale: buildConfidenceRationale(input.packet),
      rationale: "Surfaced because youth-directed or age-related context was retained alongside missing privacy-supporting disclosure signals.",
      status: "surface"
    };
  }

  if (
    input.packet.unifiedFindingId === "privacy_rights_path_present" &&
    input.packet.sourceRefs.some(
      (sourceRef) =>
        sourceRef.kind === "signal" &&
        sourceRef.source === "policy_enrichment_signal" &&
        (sourceRef.key === "privacy.privacy_rights_path_present" || sourceRef.key === "policyRightsSignals")
    )
  ) {
    return {
      confidenceRationale: buildConfidenceRationale(input.packet),
      rationale: "Surfaced because structured policy evidence retained a concrete privacy-rights path.",
      status: "surface"
    };
  }

  if (
    input.packet.unifiedFindingId === "consent_surface_missing" &&
    input.packet.evidence?.flags?.includes("privacy.consent_surface_missing")
  ) {
    return {
      confidenceRationale: buildConfidenceRationale(input.packet),
      rationale: "Surfaced because the scan retained a clear domain-level signal that no user-facing consent surface was detected.",
      status: "surface"
    };
  }

  if (
    input.packet.unifiedFindingId === "gpc_disclosure_present" &&
    input.packet.sourceRefs.some(
      (sourceRef) =>
        sourceRef.kind === "signal" &&
        sourceRef.source === "policy_enrichment_signal" &&
        sourceRef.key === "privacy.gpc_disclosure_present"
    )
  ) {
    return {
      confidenceRationale: buildConfidenceRationale(input.packet),
      rationale: "Surfaced because structured policy evidence retained a clear disclosure about GPC handling.",
      status: "surface"
    };
  }

  if (
    input.packet.unifiedFindingId === "tracking_technologies_disclosure_present" &&
    input.packet.sourceRefs.some(
      (sourceRef) =>
        sourceRef.kind === "signal" &&
        sourceRef.source === "policy_enrichment_signal" &&
        sourceRef.key === "privacy.tracking_technologies_disclosure_present"
    )
  ) {
    return {
      confidenceRationale: buildConfidenceRationale(input.packet),
      rationale: "Surfaced because structured policy evidence retained a disclosure about cookies, pixels, tags, beacons, scripts, or similar technologies.",
      status: "surface"
    };
  }

  if (
    input.packet.unifiedFindingId === "accessibility_support_path_missing" &&
    input.packet.evidence?.flags?.includes("accessibility.accessibility_support_path_missing")
  ) {
    return {
      confidenceRationale: buildConfidenceRationale(input.packet),
      rationale: "Surfaced because the scan retained a clear domain-level signal that no accessibility support path was detected.",
      status: "surface"
    };
  }

  if (
    input.packet.unifiedFindingId === "accessibility_support_path_present" &&
    input.packet.sourceRefs.some(
      (sourceRef) =>
        sourceRef.kind === "signal" &&
        sourceRef.source === "snapshot_signal" &&
        sourceRef.key === "accessibility.accessibility_contact_method_present"
    )
  ) {
    return {
      confidenceRationale: buildConfidenceRationale(input.packet),
      rationale: "Surfaced because the scan retained a clear domain-level accessibility support path.",
      status: "surface"
    };
  }

  if (
    input.packet.unifiedFindingId === "sale_sharing_controls_missing" &&
    input.packet.evidence?.flags?.includes("privacy.sale_sharing_controls_missing")
  ) {
    return {
      confidenceRationale: buildConfidenceRationale(input.packet),
      rationale: "Surfaced because the scan retained a clear domain-level signal that sale or sharing controls were not detected despite retargeting-related behavior.",
      status: "surface"
    };
  }

  if (
    input.packet.unifiedFindingId === "targeted_advertising_disclosure_present" &&
    input.packet.sourceRefs.some(
      (sourceRef) =>
        sourceRef.kind === "signal" &&
        sourceRef.source === "policy_enrichment_signal" &&
        sourceRef.key === "privacy.targeted_advertising_disclosure_present"
    )
  ) {
    return {
      confidenceRationale: buildConfidenceRationale(input.packet),
      rationale: "Surfaced because structured policy evidence retained a targeted-advertising or sale/sharing disclosure.",
      status: "surface"
    };
  }

  if (
    input.packet.unifiedFindingId === "behavioral_analytics_disclosure_present" &&
    input.packet.sourceRefs.some(
      (sourceRef) =>
        sourceRef.kind === "signal" &&
        sourceRef.source === "policy_enrichment_signal" &&
        sourceRef.key === "privacy.behavioral_analytics_disclosure_present"
    )
  ) {
    return {
      confidenceRationale: buildConfidenceRationale(input.packet),
      rationale: "Surfaced because structured policy evidence retained a disclosure about behavioral analytics or replay-style monitoring.",
      status: "surface"
    };
  }

  if (
    (input.packet.unifiedFindingId === "cookie_policy_unavailable" ||
      input.packet.unifiedFindingId === "accessibility_statement_unavailable") &&
    (input.packet.evidence?.flags?.includes("guessed_only") ||
      !hasConfirmedLinkedDiscoverySource(
        input.packet.details?.family === "coverage_gap" ? input.packet.details.bestDiscoverySource : null
      ))
  ) {
    return {
      confidenceRationale: buildConfidenceRationale(input.packet),
      rationale: "Suppressed because the unavailable page was not tied to a strong confirmed linked target from the scanned site.",
      status: "suppress"
    };
  }

  if (
    input.packet.unifiedFindingId === "weak_cookie_security_attributes" &&
    ![
      ...(input.packet.evidence?.entities?.missingSecureCookieNames ?? []),
      ...(input.packet.evidence?.entities?.missingHttpOnlyCookieNames ?? []),
      ...(input.packet.evidence?.entities?.weakSameSiteCookieNames ?? []),
      ...(input.packet.evidence?.entities?.thirdPartyWeakAttributeCookieNames ?? [])
    ].some((value) => typeof value === "string" && value.trim().length > 0)
  ) {
    return {
      confidenceRationale: buildConfidenceRationale(input.packet),
      rationale: "Kept for audit only because the current evidence does not retain concrete cookie examples for the weak attribute claim.",
      status: "audit_only"
    };
  }

  if (
    input.packet.unifiedFindingId === "arbitration_clause_present" &&
    input.packet.sourceRefs.some(
      (sourceRef) =>
        sourceRef.kind === "signal" &&
        sourceRef.source === "policy_enrichment_signal" &&
        sourceRef.key === "commerce.arbitration_clause_present"
    )
  ) {
    return {
      confidenceRationale: buildConfidenceRationale(input.packet),
      rationale: "Surfaced because structured policy evidence retained an arbitration or dispute-resolution clause.",
      status: "surface"
    };
  }

  if (
    needsPageAttribution &&
    !input.packet.confidenceInputs.hasPageAttribution &&
    !input.packet.confidenceInputs.hasKeyPageDiscoveryEvidence &&
    !input.packet.confidenceInputs.hasDirectRuntimeEvidence
  ) {
    return {
      confidenceRationale: buildConfidenceRationale(input.packet),
      rationale: "Kept for audit only because the current evidence does not yet identify concrete affected pages clearly enough for customer-facing surfacing.",
      status: "audit_only"
    };
  }

  if (
    input.packet.confidenceBand === "low" &&
    input.packet.confidenceInputs.isFallbackOnly
  ) {
    return {
      confidenceRationale: buildConfidenceRationale(input.packet),
      rationale: "Kept for audit only because the packet is fallback-only and the benefit of surfacing it broadly is limited right now.",
      status: "audit_only"
    };
  }

  if (
    input.packet.confidenceBand === "low" &&
    input.packet.confidenceInputs.sourceCount <= 1 &&
    !input.packet.confidenceInputs.hasDirectRuntimeEvidence &&
    !input.packet.confidenceInputs.hasStructuredValidationEvidence &&
    !input.packet.confidenceInputs.hasConcretePayloadEvidence
  ) {
    return {
      confidenceRationale: buildConfidenceRationale(input.packet),
      rationale: "Kept for audit only because evidence is still too thin for confident report surfacing.",
      status: "audit_only"
    };
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

export function buildUnifiedFindingPackets(input: {
  reviewFindingCandidates: UnifiedFindingCandidate[];
  validationFindings: ScanValidationFinding[];
}) {
  const normalizedConcerns = buildNormalizedConcerns({
    reviewFindingCandidates: input.reviewFindingCandidates,
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
    const nextPacket: UnifiedFindingPacket = existing ?? {
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

    nextPacket.severity = maxSeverity(nextPacket.severity, candidate.severity);
    if (!existing || nextPacket.summary.trim().length === 0) {
      nextPacket.summary = candidate.description;
    }

    if (candidate.sourceType === "signal" && candidate.signalSource && candidate.signalKey) {
      nextPacket.sourceRefs = appendUniqueSourceRef(nextPacket.sourceRefs, {
        kind: "signal",
        key: candidate.signalKey,
        label: candidate.signalLabel,
        source: candidate.signalSource
      });
    } else {
      nextPacket.sourceRefs = appendUniqueSourceRef(nextPacket.sourceRefs, { kind: "issue", title: candidate.title });
    }

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
    nextPacket.concernContext = {
      assertionLevels: uniqueConcernFlags([
        ...(existing?.concernContext?.assertionLevels ?? []),
        ...(candidate.normalizedConcern ? [candidate.normalizedConcern.allowedNarrativeTier] : [])
      ]),
      evidenceStrengthFlags: uniqueConcernFlags([
        ...(existing?.concernContext?.evidenceStrengthFlags ?? []),
        ...(candidate.normalizedConcern?.evidenceStrengthFlags ?? [])
      ]),
      externalSurfacingEligibilities: uniqueConcernFlags([
        ...(existing?.concernContext?.externalSurfacingEligibilities ?? []),
        ...(candidate.normalizedConcern ? [candidate.normalizedConcern.externalSurfacingEligibility] : [])
      ]),
      negativeEvidenceFlags: uniqueConcernFlags([
        ...(existing?.concernContext?.negativeEvidenceFlags ?? []),
        ...(candidate.normalizedConcern?.negativeEvidenceFlags ?? [])
      ]),
      originTypes: uniqueConcernFlags([
        ...(existing?.concernContext?.originTypes ?? []),
        ...(candidate.normalizedConcern ? [candidate.normalizedConcern.originType] : [])
      ]),
      promotionEligibilities: uniqueConcernFlags([
        ...(existing?.concernContext?.promotionEligibilities ?? []),
        ...(candidate.normalizedConcern ? [candidate.normalizedConcern.promotionEligibility] : [])
      ])
    };

    nextPacket.evidence = mergeEvidence(nextPacket.evidence, fallbackEvidence, candidate.evidence, linkedValidationFinding);
    const attributedUrls = uniqueStrings([
      ...(nextPacket.evidence?.pageUrls ?? []),
      ...(nextPacket.evidence?.sourceUrls ?? []),
      linkedValidationFinding?.pageUrl ?? null
    ]);
    nextPacket.primaryPageUrl = attributedUrls[0] ?? null;
    nextPacket.affectedPageCount = attributedUrls.length;
    nextPacket.details = buildUnifiedFindingDetails({
      fallbackEvidence: candidate.fallbackEvidence ?? null,
      findingId,
      linkedValidationFinding,
      observedValue: candidate.observedValue,
      summary: candidate.description
    });
    nextPacket.confidenceInputs = deriveConfidenceInputs({
      fallbackEvidenceRows: fallbackEvidenceByPacket.get(findingId) ?? [],
      packet: nextPacket,
      validationFindings: validationByPacket.get(findingId) ?? []
    });
    nextPacket.confidenceBand = deriveConfidenceBand(nextPacket.confidenceInputs, nextPacket.severity);
    packets.set(findingId, nextPacket);
  };

  for (const candidate of normalizedCandidates) {
    const mappedFinding =
      (candidate.normalizedConcern?.suggestedUnifiedFindingId
        ? getReportUnifiedFinding(candidate.normalizedConcern.suggestedUnifiedFindingId)
        : null) ??
      (candidate.sourceType === "signal" && candidate.signalSource && candidate.signalKey
        ? getReportUnifiedFindingForSignal(candidate.signalSource, candidate.signalKey) ??
          getReportUnifiedFindingByAlias(candidate.title)
        : getReportUnifiedFindingByAlias(candidate.title) ??
          (candidate.linkedValidationFinding
            ? getReportUnifiedFindingForValidationRule(candidate.linkedValidationFinding.ruleKey)
            : null));

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
  validationFindings: ScanValidationFinding[];
  validationFindingLookup: Map<string, ScanValidationFinding>;
}) {
  const packets = buildUnifiedFindingPackets({
    reviewFindingCandidates: input.reviewFindingCandidates,
    validationFindings: input.validationFindings
  });

  return packets.map((packet, _index, rows): UnifiedFindingDisplayPacket => {
    const linkedValidationFinding = selectPrimaryValidationFinding(
      packet.sourceRefs
        .filter((sourceRef): sourceRef is Extract<typeof sourceRef, { kind: "validation" }> => sourceRef.kind === "validation")
        .flatMap((sourceRef) => {
          const matched = findValidationFindingForKeys(input.validationFindingLookup, [sourceRef.ruleKey]);
          return matched ? [matched] : [];
        })
    );

    const siblingRows = rows.filter((row) => row.unifiedFindingId !== packet.unifiedFindingId);
    const presentation = buildCanonicalReviewFindingPresentation(
      {
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
      },
      siblingRows.map((row) => ({
        evidence: row.evidence?.pageUrls ?? [],
        fallbackEvidence: row.evidence ?? null,
        linkedValidationFinding: null,
        observedValue: row.summary,
        severity: row.severity,
        title: row.title
      }))
    );
    const presentationDecision = buildPresentationDecision({
      packet,
      siblingRows: siblingRows
    });
    const resolvedPresentation = buildPresentationCopy(packet, presentation);

    return {
      ...packet,
      linkedValidationFinding,
      observedValue: getBestObservedValue([packet.evidence?.snippets?.[0] ?? null, packet.summary]),
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
