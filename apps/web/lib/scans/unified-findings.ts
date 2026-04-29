import {
  type MergedSignalRecord,
  getReportUnifiedFinding,
  getReportUnifiedFindingByAlias,
  getReportUnifiedFindingForSignal,
  getReportUnifiedFindingForValidationRule,
  type ReportSignalSource,
  type ReportUnifiedFindingId,
  type ReportUnifiedFindingCategoryAlignment
} from "@website-signal-risk-scanner/shared";
import {
  buildCanonicalReviewFindingPresentation,
  normalizeFindingName,
  type CanonicalReviewFindingPresentation,
  type ReviewFindingSeverity
} from "./canonical-review-finding";
import {
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
  getPolicyPositiveSignalKeysForFinding,
  isPolicyPositiveSignalKey
} from "./policy-positive-signal-contract";
import {
  getContradictionEvidenceBundle
} from "./contradiction-evidence-contract";
import {
  hasConcretePreconsentArtifact
} from "./promotion-evidence-contracts";
import {
  isMeaningfulPolicyText,
  normalizePolicySnippet,
  normalizePolicySnippetList
} from "./policy-snippet-normalization";
import {
  getPolicyEvidenceSnippetValues,
  getPolicyAmbiguityScore,
  getPolicyDsarMechanism,
  getPolicyPageType,
  getPolicyPageUrl,
  getPolicyRightsSignals,
  getPolicySemanticConfidence,
  getPolicySnippetCount,
  getPolicySummaryText,
  getPrivacyContactChannelType
} from "./policy-enrichment-row";
import {
  hasConcreteSanitizedNetworkEvidence,
  hasSanitizedNetworkEvidenceHash
} from "./sanitized-network-evidence";
import {
} from "./financial-validation-contract";
import {
  evaluateUnifiedFindingSurfacing,
  getSurfacingDecisionSortPriority,
  mapSurfacingDecisionToLegacyStatus,
  type UnifiedFindingSurfacingDecision
} from "./report-surfacing-policy";
import { buildCookiePolicyFallbackEvidence, type FetchQuality } from "./signal-fallback-evidence";
import { buildReviewFindingCandidatesFromMergedSignals } from "./merged-signals";
import { buildScanDomainContext, type ScanDomainContext } from "./scan-domain-context";
import {
  formatRepresentativeAccessibilityCoverage,
  formatRepresentativeAccessibilityExampleSnippets,
  getRepresentativeAccessibilityExampleCoverage,
  hasExternallyPromotableAccessibilityExamples
} from "./accessibility-evidence";

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
      contradictionBasis?: string | null;
      policyClaimType?: string | null;
      runtimeObservationType?: string | null;
      runtimePhase?: string | null;
      conflictType?: string | null;
      contradictionReviewStatus?: string | null;
      policySnippet?: string | null;
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
      family: "context";
      kind: string;
    }
  | {
      family: "financial_promotion";
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
    hasCorroboratedPositiveSurfaceEvidence: boolean;
    hasDirectRuntimeEvidence: boolean;
    hasKeyPageDiscoveryEvidence: boolean;
    hasReadableSurfaceSnippetEvidence: boolean;
    hasMultipleHumanFacingUrls: boolean;
    hasPageAttribution: boolean;
    hasPacketBackedEvidence: boolean;
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
    fetchQuality?: FetchQuality | null;
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
  downgradeReasons: string[];
  rationale: string;
  status: "surface" | "audit_only" | "suppress";
  verificationLabel: string;
  verificationState: "verified" | "discovered" | "blocked" | "runtime" | "triage";
};

type UnifiedFindingPresentationDecisionDraft = Omit<
  UnifiedFindingPresentationDecision,
  "verificationLabel" | "verificationState" | "downgradeReasons"
>;

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

export type UnifiedFindingCoverageSummary = {
  legalCoverageScore?: number | null;
  pagesScanned?: number | null;
  policyEnrichmentCount?: number | null;
  verifiedPublicSurfacesCount?: number | null;
};

type FamilyPacketTargetRecord = {
  canonicalUrl?: unknown;
  fetchQuality?: unknown;
  snippet?: unknown;
  sourceSurfaceTypes?: unknown;
  supportedSurfaceTypes?: unknown;
  supportingRefs?: unknown;
  title?: unknown;
};

type FamilyPacketFindingRecord = {
  evidenceUrls?: unknown;
  evidencePayload?: unknown;
  findingId?: unknown;
  reason?: unknown;
  sourceSurfaceTypes?: unknown;
};

type FindingFamilyPacketRecord = {
  canonicalTargets?: unknown;
  familyId?: unknown;
  supportedUnifiedFindings?: unknown;
};

function normalizeUnifiedFindingEvidenceRecord(
  record: Record<string, unknown> | null | undefined
): Record<string, unknown> {
  if (!record) {
    return {};
  }

  const normalized: Record<string, unknown> = { ...record };
  const assignCanonicalField = (canonicalKey: string, legacyKeys: string[]) => {
    if (normalized[canonicalKey] !== undefined) {
      return;
    }

    for (const legacyKey of legacyKeys) {
      if (record[legacyKey] !== undefined) {
        normalized[canonicalKey] = record[legacyKey];
        return;
      }
    }
  };

  assignCanonicalField("fetchQuality", ["fetch_quality"]);
  assignCanonicalField("pageUrl", ["page_url"]);
  assignCanonicalField("pageUrls", ["page_urls"]);
  assignCanonicalField("policySnippet", ["policy_snippet"]);
  assignCanonicalField("policySnippets", ["policy_snippets"]);
  assignCanonicalField("policySummaryShort", ["policy_summary_short"]);
  assignCanonicalField("runtimeEvidence", ["runtime_evidence"]);
  assignCanonicalField("runtimeEvidenceArtifacts", ["runtime_evidence_artifacts"]);
  assignCanonicalField("sourceUrl", ["source_url"]);
  assignCanonicalField("sourceUrls", ["source_urls"]);

  return normalized;
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => typeof value === "string" && value.trim().length > 0))];
}

function getPolicyFieldCoverageFlags(record: Record<string, unknown> | null | undefined) {
  const coverage =
    record?.policyFieldCoverage && typeof record.policyFieldCoverage === "object"
      ? record.policyFieldCoverage
      : record?.policy_field_coverage && typeof record.policy_field_coverage === "object"
        ? record.policy_field_coverage
        : null;

  if (!coverage) {
    return [];
  }

  const flags: string[] = [];
  for (const [field, value] of Object.entries(coverage as Record<string, unknown>)) {
    if (!value || typeof value !== "object") {
      continue;
    }
    const found = (value as { found?: unknown }).found;
    if (found === true) {
      flags.push(`policy_field:${field}:found`);
    } else if (found === false) {
      flags.push(`policy_field:${field}:absent`);
    }
  }

  return flags;
}

function uniqueTitleRecords(values: Array<{ title: string; url: string }>) {
  const seen = new Set<string>();
  const next: Array<{ title: string; url: string }> = [];

  for (const value of values) {
    const key = `${value.url.trim().toLowerCase()}::${value.title.trim().toLowerCase()}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    next.push(value);
  }

  return next;
}

export type UnifiedFindingDisplayPacket = UnifiedFindingPacket & {
  linkedValidationFinding: ScanValidationFinding | null;
  observedValue: string | null;
  presentationDecision: UnifiedFindingPresentationDecision;
  presentation: CanonicalReviewFindingPresentation;
  referenceLabel?: string;
  referenceUrl?: string;
  sourceLabel?: string;
  sourceUrl?: string;
  surfacingDecision: UnifiedFindingSurfacingDecision;
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

const ACCESSIBILITY_ISSUE_FINDING_IDS = new Set([
  "wcag_issue_summary",
  "accessibility_risk_score"
]);

const POLICY_EXTRACTION_FINDING_IDS = new Set([
  "low_confidence_policy_extraction",
  "policy_extraction_provider_error",
  "disclosure_likely_obstructed",
  "cookie_policy_structurally_obstructed",
  "surface_title_mismatch",
  "affiliate_disclosure_scope_limited",
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
  "missing_transfer_disclosure",
  "data_categories_disclosure_missing",
  "third_party_recipient_disclosure_missing",
  "purpose_of_use_disclosure_missing"
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
  "reject_did_not_reduce_third_party_cookies",
  "rtb_cookie_sync_observed",
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
  "retargeting_pixel_observed",
  "video_content_tracking_exposure",
  "fingerprinting_observed"
]);

const SENSITIVE_DATA_FINDING_IDS = new Set([
  "session_replay_on_sensitive_input_surface",
  "sensitive_data_collection_with_third_party_tracking_present",
  "minors_or_age_gated_collection_context",
  "children_privacy_context_without_supporting_disclosure"
]);

const COMMERCIAL_FINDING_IDS = new Set([
  "discount_claim_present",
  "original_price_comparison_present",
  "limited_time_pressure",
  "store_credit_only_remedy",
  "restrictive_termination_or_suspension_terms",
  "cancellation_method_disclosure_missing"
]);

const CONTEXT_FINDING_IDS = new Set([
  "regulator_operated_mock_investment_example",
  "popup_behavior_observed",
  "blocking_overlay_observed",
  "autoplay_media_observed"
]);

const CONTRADICTORY_SURFACE_FINDING_PAIRS: ReadonlyMap<string, string> = new Map([
  ["privacy_contact_channel_missing", "privacy_contact_path_present"],
  ["privacy_policy_missing_surface", "privacy_policy_present"],
  ["terms_missing_surface", "terms_of_service_present"],
  ["cookie_policy_missing_surface", "cookie_policy_present"],
  ["accessibility_support_path_missing", "accessibility_support_path_present"]
]);

const FINANCIAL_PROMOTION_FINDING_IDS = new Set([
  "ai_financial_advice_or_trading_claims_without_disclosure",
  "apr_or_interest_rate_disclosure_present",
  "earnings_claim_without_adjacent_disclosure",
  "fee_disclosure_missing_or_opaque",
  "fee_disclosure_present",
  "financial_urgency_pressure_tactic_detected",
  "guaranteed_outcome_claim_detected",
  "guaranteed_or_high_return_claims_present",
  "high_risk_product_risk_disclosure_missing",
  "hypothetical_performance_disclosure_missing",
  "investment_purchase_by_credit_card_present",
  "investment_risk_disclosure_missing",
  "investment_risk_disclosure_present",
  "investment_urgency_countdown_present",
  "legal_entity_name_present",
  "leveraged_or_high_risk_product_promotion",
  "material_terms_hard_to_locate",
  "operator_contact_path_present",
  "past_performance_disclaimer_present",
  "performance_claims_without_context",
  "pricing_or_fee_transparency_unclear",
  "promo_to_terms_conflict",
  "pump_and_dump_language_present",
  "registration_claim_support_missing",
  "registration_identifier_missing",
  "regulatory_registration_disclosure_absent",
  "simulated_performance_without_disclosure",
  "testimonial_endorsement_financial_promotion_risk",
  "unsubstantiated_testimonial_near_performance_claim",
  "unqualified_superlative_claim_detected",
  "vague_whitepaper_or_technical_obfuscation_present",
  "yield_or_return_claims_high_risk"
]);

const DECEPTIVE_FINANCIAL_PROMOTION_FINDING_IDS = new Set([
  "ai_financial_advice_or_trading_claims_without_disclosure",
  "earnings_claim_without_adjacent_disclosure",
  "financial_urgency_pressure_tactic_detected",
  "guaranteed_outcome_claim_detected",
  "guaranteed_or_high_return_claims_present",
  "high_risk_product_risk_disclosure_missing",
  "investment_purchase_by_credit_card_present",
  "investment_risk_disclosure_missing",
  "investment_urgency_countdown_present",
  "performance_claims_without_context",
  "pricing_or_fee_transparency_unclear",
  "pump_and_dump_language_present",
  "regulatory_registration_disclosure_absent",
  "simulated_performance_without_disclosure",
  "testimonial_endorsement_financial_promotion_risk",
  "unsubstantiated_testimonial_near_performance_claim",
  "unqualified_superlative_claim_detected",
  "vague_whitepaper_or_technical_obfuscation_present",
  "yield_or_return_claims_high_risk"
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

const POSITIVE_SURFACE_FINDING_IDS = new Set([
  "privacy_policy_present",
  "terms_of_service_present",
  "cookie_policy_present",
  "contact_support_path_present",
  "targeted_advertising_choices_present",
  "privacy_rights_path_present",
  "privacy_contact_path_present",
  "gpc_disclosure_present",
  "tracking_technologies_disclosure_present",
  "third_party_advertising_disclosure_present",
  "targeted_advertising_disclosure_present",
  "behavioral_analytics_disclosure_present",
  "children_privacy_disclosure_present",
  "accessibility_support_path_present",
  "arbitration_clause_present"
]);

const BLOCKED_OR_INTERSTITIAL_TEXT_PATTERN =
  /unable to authorize your request|access denied|verify you are human|captcha|bot challenge|request blocked|security check|temporarily unavailable|forbidden|we(?:'|’)re sorry, but we were unable to authorize your request/i;

function uniqueConcernFlags<T extends string>(values: T[]) {
  return [...new Set(values)];
}

function isDiscoveredButUnverifiedDisclosurePacket(packet: UnifiedFindingPacket) {
  const pathOnlyPositiveFinding =
    POSITIVE_SURFACE_FINDING_IDS.has(packet.unifiedFindingId) || packet.unifiedFindingId === "affiliate_disclosure_present";
  const hasAnyUrl = [...(packet.evidence?.pageUrls ?? []), ...(packet.evidence?.sourceUrls ?? [])].some(
    (value) => typeof value === "string" && value.trim().length > 0
  );
  const hasReadableSnippet = (packet.evidence?.snippets ?? []).some(
    (value) => typeof value === "string" && value.trim().length > 0
  );

  return pathOnlyPositiveFinding && hasAnyUrl && !hasReadableSnippet;
}

function deriveVerificationState(packet: UnifiedFindingPacket): UnifiedFindingPresentationDecision["verificationState"] {
  const negativeEvidenceFlags = packet.concernContext?.negativeEvidenceFlags ?? [];
  const fetchQuality = packet.evidence?.fetchQuality ?? null;
  const positiveSurfaceCorroboration = hasCorroboratedPositiveSurfaceEvidence(packet);

  if (
    !positiveSurfaceCorroboration &&
    (negativeEvidenceFlags.includes("blocked_or_interstitial_evidence_observed") || fetchQuality === "blocked_interstitial")
  ) {
    return "blocked";
  }

  if (
    packet.confidenceInputs.hasDirectRuntimeEvidence ||
    packet.confidenceInputs.hasConcretePayloadEvidence ||
    packet.confidenceInputs.hasStructuredValidationEvidence
  ) {
    return "runtime";
  }

  if (positiveSurfaceCorroboration) {
    return "verified";
  }

  if (
    negativeEvidenceFlags.includes("positive_surface_content_unverified") ||
    fetchQuality === "thin_content" ||
    isDiscoveredButUnverifiedDisclosurePacket(packet)
  ) {
    return "discovered";
  }

  if (fetchQuality === "verified_content" || (packet.confidenceInputs.hasPolicyTextEvidence && packet.confidenceInputs.hasPageAttribution)) {
    return "verified";
  }

  return "triage";
}

function getVerificationLabel(state: UnifiedFindingPresentationDecision["verificationState"]) {
  switch (state) {
    case "verified":
      return "Verified content";
    case "discovered":
      return "Discovered, not verified";
    case "blocked":
      return "Blocked or interstitial";
    case "runtime":
      return "Runtime evidence";
    default:
      return "Triage signal";
  }
}

function getKeyPageTitleRecords(fallbackEvidence: Record<string, unknown> | null | undefined) {
  const rows = Array.isArray(fallbackEvidence?.keyPageTitleRecords) ? fallbackEvidence.keyPageTitleRecords : [];
  return rows.flatMap((row) => {
    if (!row || typeof row !== "object") {
      return [];
    }

    const title = typeof (row as { title?: unknown }).title === "string" ? (row as { title: string }).title.trim() : "";
    const url = typeof (row as { url?: unknown }).url === "string" ? (row as { url: string }).url.trim() : "";
    if (title.length === 0) {
      return [];
    }

    const canonicalUrl =
      typeof (row as { canonicalUrl?: unknown }).canonicalUrl === "string"
        ? (row as { canonicalUrl: string }).canonicalUrl.trim()
        : "";
    const ogUrl =
      typeof (row as { ogUrl?: unknown }).ogUrl === "string"
        ? (row as { ogUrl: string }).ogUrl.trim()
        : "";

    return [
      {
        canonicalUrl: canonicalUrl.length > 0 ? canonicalUrl : null,
        ogUrl: ogUrl.length > 0 ? ogUrl : null,
        title,
        url: url.length > 0 ? url : null
      }
    ];
  });
}

function getSurfaceTypeExpectation(findingId: string) {
  switch (findingId) {
    case "privacy_policy_present":
      return { disallowed: /affiliate disclosure|terms of service|contact us/i, expected: /privacy/i, label: "privacy policy" };
    case "terms_of_service_present":
      return { disallowed: /affiliate disclosure|privacy policy|contact us/i, expected: /terms|conditions|terms of use/i, label: "terms surface" };
    case "cookie_policy_present":
      return { disallowed: /affiliate disclosure|terms of service|contact us/i, expected: /cookie|privacy choices|privacy settings/i, label: "cookie surface" };
    case "contact_support_path_present":
      return { disallowed: /affiliate disclosure|privacy policy|terms of service/i, expected: /contact|support|help|feedback/i, label: "contact surface" };
    default:
      return null;
  }
}

function synthesizeGenericReviewFindingCandidates(reviewFindingCandidates: UnifiedFindingCandidate[]) {
  const synthetic: UnifiedFindingCandidate[] = [];

  for (const candidate of reviewFindingCandidates) {
    const findingId = resolveUnifiedFindingIdForCandidate(candidate);
    const fallbackEvidence = candidate.fallbackEvidence ?? null;

    if (!findingId || !fallbackEvidence) {
      continue;
    }

    const titleRecords = getKeyPageTitleRecords(fallbackEvidence);
    const expectation = getSurfaceTypeExpectation(findingId);

    if (expectation) {
      const mismatch = titleRecords.find(({ title, url, canonicalUrl, ogUrl }) => {
        if (expectation.expected.test(title)) {
          try {
            if (url && canonicalUrl && new URL(url).pathname !== new URL(canonicalUrl).pathname) {
              return true;
            }
            if (url && ogUrl && new URL(url).pathname !== new URL(ogUrl).pathname) {
              return true;
            }
          } catch {
            return false;
          }

          return false;
        }
        if (expectation.disallowed.test(title)) {
          return true;
        }
        if (!url) {
          return false;
        }

        try {
          const path = new URL(url).pathname.toLowerCase();
          if (findingId === "privacy_policy_present" && /privacy/.test(path) && !/privacy/i.test(title)) {
            return true;
          }
          if (findingId === "terms_of_service_present" && /terms|conditions|tos/.test(path) && !/terms|conditions|terms of use/i.test(title)) {
            return true;
          }
          if (findingId === "cookie_policy_present" && /cookie|privacy-choices|privacychoices/.test(path) && !/cookie|privacy choices|privacy settings/i.test(title)) {
            return true;
          }
          if (findingId === "contact_support_path_present" && /contact|help|support|feedback/.test(path) && !/contact|support|help|feedback/i.test(title)) {
            return true;
          }
        } catch {
          return false;
        }

        return false;
      });

      if (mismatch) {
        synthetic.push({
          description: `The retained ${expectation.label} URL resolved to a page title that appears inconsistent with the expected surface type.`,
          evidence: uniqueStrings([...(candidate.evidence ?? []), ...(mismatch.url ? [mismatch.url] : [])]),
          fallbackEvidence: {
            unifiedFindingId: "surface_title_mismatch",
            canonicalUrl: mismatch.canonicalUrl,
            ogUrl: mismatch.ogUrl,
            pageUrl: mismatch.url,
            pageUrls: mismatch.url ? [mismatch.url] : [],
            policySnippets: [mismatch.title],
            retainedSurfaceTitle: mismatch.title,
            sourceSurfaceFindingId: findingId
          },
          observedValue: mismatch.title,
          severity: "medium",
          sourceType: "issue",
          title: "Retained surface title mismatch"
        });
      }
    }

    if (findingId === "affiliate_disclosure_present") {
      const pageUrls = uniqueStrings([
        typeof fallbackEvidence.pageUrl === "string" ? fallbackEvidence.pageUrl : null,
        ...(Array.isArray(fallbackEvidence.pageUrls)
          ? fallbackEvidence.pageUrls.filter((value): value is string => typeof value === "string")
          : [])
      ]);
      const dedicatedAffiliateOnly =
        pageUrls.length > 0 &&
        pageUrls.every((value) => {
          try {
            return /affiliate/i.test(new URL(value).pathname);
          } catch {
            return /affiliate/i.test(value);
          }
        });
      const snippets = uniqueStrings([
        ...(Array.isArray(fallbackEvidence.policySnippets)
          ? fallbackEvidence.policySnippets.filter((value): value is string => typeof value === "string")
          : []),
        typeof fallbackEvidence.policySummaryShort === "string" ? fallbackEvidence.policySummaryShort : null
      ]);
      const hasInlineScopeLanguage = snippets.some((value) =>
        /on this page|through links on this page|recommendations on this page|where we recommend/i.test(value)
      );
      const hasReadableAffiliateDisclosureText = snippets.some((value) => isReadableSurfaceSnippet(value));

      if (dedicatedAffiliateOnly && hasReadableAffiliateDisclosureText && !hasInlineScopeLanguage) {
        synthetic.push({
          description:
            "The retained affiliate disclosure evidence came from a dedicated disclosure surface, but the scan did not retain page-attributed evidence showing that disclosure near specific recommendations or outbound purchase paths.",
          evidence: candidate.evidence,
          fallbackEvidence: {
            unifiedFindingId: "affiliate_disclosure_scope_limited",
            pageUrls,
            policySnippets: snippets,
            sourceSurfaceFindingId: findingId
          },
          observedValue: snippets[0] ?? null,
          severity: "medium",
          sourceType: "issue",
          title: "Affiliate disclosure scope limited"
        });
      }
    }

    if (findingId === "privacy_policy_present" || findingId === "terms_of_service_present") {
      const retainedSnippets = uniqueStrings([
        ...(Array.isArray(fallbackEvidence.policySnippets)
          ? fallbackEvidence.policySnippets.filter((value): value is string => typeof value === "string")
          : []),
        typeof fallbackEvidence.policySummaryShort === "string" ? fallbackEvidence.policySummaryShort : null
      ]);
      const boilerplateSignals = uniqueStrings(
        retainedSnippets.flatMap((value) => {
          const hits: string[] = [];
          if (/advertising partners privacy policies?/i.test(value)) {
            hits.push("generic_ad_partner_disclosure");
          }
          if (/cookies and web beacons/i.test(value)) {
            hits.push("generic_cookie_web_beacons");
          }
          if (/log files/i.test(value)) {
            hits.push("generic_log_files");
          }
          if (/hyperlinking to our content/i.test(value)) {
            hits.push("generic_hyperlinking_clause");
          }
          if (/\biframes?\b/i.test(value)) {
            hits.push("generic_iframe_clause");
          }
          if (/comments?/i.test(value) && /post|publish|user/i.test(value)) {
            hits.push("generic_user_comment_clause");
          }
          if (/ccpa privacy rights/i.test(value)) {
            hits.push("ccpa_rights_template");
          }
          if (/gdpr/i.test(value)) {
            hits.push("gdpr_template");
          }
          return hits;
        })
      );

      if (boilerplateSignals.length >= 2) {
        synthetic.push({
          description:
            "The retained legal disclosure text includes multiple broad boilerplate markers that may not be well-tailored to the observed site implementation.",
          evidence: candidate.evidence,
          fallbackEvidence: {
            unifiedFindingId: "policy_clarity_risk",
            pageUrls: Array.isArray(fallbackEvidence.pageUrls)
              ? fallbackEvidence.pageUrls.filter((value): value is string => typeof value === "string")
              : [],
            policyBoilerplateSignals: boilerplateSignals,
            policySnippets: retainedSnippets,
            sourceSurfaceFindingId: findingId
          },
          observedValue: retainedSnippets[0] ?? null,
          severity: "medium",
          sourceType: "issue",
          title: "Policy clarity risk"
        });
      }
    }
  }

  return synthetic;
}

function getDowngradeReasons(packet: UnifiedFindingPacket): string[] {
  const negativeEvidenceFlags = packet.concernContext?.negativeEvidenceFlags ?? [];

  return uniqueStrings([
    negativeEvidenceFlags.includes("blocked_or_interstitial_evidence_observed")
      ? "Retained page evidence looked like an authorization wall, challenge page, or other interstitial."
      : null,
    negativeEvidenceFlags.includes("positive_surface_content_unverified")
      ? "A likely disclosure URL was discovered, but readable user-facing page content was not verified."
      : null,
    !negativeEvidenceFlags.includes("positive_surface_content_unverified") && isDiscoveredButUnverifiedDisclosurePacket(packet)
      ? "A likely disclosure URL was discovered, but readable user-facing page content was not verified."
      : null,
    negativeEvidenceFlags.includes("missing_concrete_preconsent_artifact")
      ? "Concrete request or vendor artifacts were not retained for the pre-consent tracking claim."
      : null,
    negativeEvidenceFlags.includes("missing_preconsent_sequence_evidence")
      ? "The retained evidence does not yet prove the request sequence happened before a clear consent choice."
      : null,
    negativeEvidenceFlags.includes("missing_concrete_sensitive_payload")
      ? "The retained evidence does not yet confirm that sensitive input or payload data was actually involved."
      : null,
    negativeEvidenceFlags.includes("missing_third_party_tracking_artifact")
      ? "Concrete third-party tracking or replay artifacts were not retained for this sensitive-data claim."
      : null,
    negativeEvidenceFlags.includes("missing_explicit_contradiction_basis")
      ? "The contradiction candidate does not retain an explicit contradiction basis yet."
      : null,
    negativeEvidenceFlags.includes("missing_specific_policy_anchor")
      ? "A specific fetched policy anchor was not retained for this finding."
      : null,
    negativeEvidenceFlags.includes("missing_specific_runtime_anchor")
      ? "A specific runtime anchor with concrete artifacts was not retained for this finding."
      : null,
    negativeEvidenceFlags.includes("missing_behavior_side_evidence")
      ? "Behavior-side runtime evidence is still incomplete for this contradiction candidate."
      : null,
    negativeEvidenceFlags.includes("missing_policy_side_evidence")
      ? "Policy-side text evidence is still incomplete for this contradiction candidate."
      : null,
    negativeEvidenceFlags.includes("missing_contradiction_mapping")
      ? "The retained evidence does not yet map the policy claim to the observed behavior clearly enough."
      : null,
    negativeEvidenceFlags.includes("unsupported_contradiction_mapping")
      ? "The retained policy claim and runtime observation do not form an approved contradiction mapping."
      : null,
    negativeEvidenceFlags.includes("policy_semantic_review_incomplete")
      ? "Policy content was not confirmed as fetched and semantically parsed for contradiction review."
      : null,
    negativeEvidenceFlags.includes("runtime_tracking_review_incomplete")
      ? "Concrete runtime tracking evidence is still incomplete for this finding."
      : null,
    negativeEvidenceFlags.includes("possible_policy_runtime_mismatch")
      ? "The retained evidence suggests a possible mismatch, but not a contradiction-grade finding."
      : null,
    negativeEvidenceFlags.includes("insufficient_evidence_for_policy_behavior_conflict")
      ? "The retained evidence is insufficient to promote a policy/behavior contradiction."
      : null,
    negativeEvidenceFlags.includes("model_suspicion_without_structured_support")
      ? "The retained contradiction narrative appears to rely on suspicion language without structured support."
      : null,
    negativeEvidenceFlags.includes("no_direct_runtime_replay_artifact_observed")
      ? "No concrete runtime replay artifact was retained yet."
      : null,
    negativeEvidenceFlags.includes("no_direct_runtime_retargeting_artifact_observed")
      ? "No concrete runtime retargeting artifact was retained yet."
      : null,
    negativeEvidenceFlags.includes("policy_target_parsing_incomplete")
      ? "The policy target was reachable, but automated parsing coverage was incomplete."
      : null,
    negativeEvidenceFlags.includes("policy_target_retrievable")
      ? "The policy target appears retrievable, so this likely needs manual content review rather than a simple absence judgment."
      : null
  ]);
}

function finalizePresentationDecision(
  packet: UnifiedFindingPacket,
  decision: UnifiedFindingPresentationDecisionDraft
): UnifiedFindingPresentationDecision {
  const verificationState = deriveVerificationState(packet);

  return {
    ...decision,
    downgradeReasons: getDowngradeReasons(packet),
    verificationLabel: getVerificationLabel(verificationState),
    verificationState
  };
}

function isDistinctExplicitPolicySnippet(
  candidate: string | null | undefined,
  claim: string | null | undefined
) {
  if (typeof candidate !== "string" || candidate.trim().length === 0) {
    return false;
  }

  const normalizedCandidate = normalizePolicySnippet(candidate);
  const normalizedClaim = normalizePolicySnippet(claim ?? "");

  if (!normalizedCandidate) {
    return false;
  }

  return !normalizedClaim || normalizedCandidate !== normalizedClaim;
}

function getExplicitPolicySnippetCandidate(record: Record<string, unknown> | null | undefined) {
  const normalizedRecord = normalizeUnifiedFindingEvidenceRecord(record);
  return (
    (Array.isArray(normalizedRecord.policySnippets)
      ? normalizedRecord.policySnippets.find((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
      : null) ??
    (typeof normalizedRecord.policySnippet === "string" && normalizedRecord.policySnippet.trim().length > 0
      ? normalizedRecord.policySnippet
      : null)
  );
}

function getBestExplicitPolicySnippet(
  record: Record<string, unknown> | null | undefined,
  contradictionEvidence: ReturnType<typeof getContradictionEvidenceBundle>
) {
  const claim = contradictionEvidence?.claim ?? null;
  const rawCandidate = getExplicitPolicySnippetCandidate(record);

  if (isDistinctExplicitPolicySnippet(rawCandidate, claim)) {
    return rawCandidate;
  }

  const bundleCandidate = contradictionEvidence?.explicitPolicySnippet ?? null;
  if (isDistinctExplicitPolicySnippet(bundleCandidate, claim)) {
    return bundleCandidate;
  }

  return null;
}

function isRawMarkerToken(value: string) {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return false;
  }

  return /^[a-z]+(?:_[a-z0-9]+)+$/i.test(trimmed) && !/\s/.test(trimmed);
}

const MAX_REVIEWER_FACING_SNIPPET_LENGTH = 600;

function isReviewerFacingSnippet(value: string) {
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_REVIEWER_FACING_SNIPPET_LENGTH) {
    return false;
  }

  if (
    /insufficient policy content fetched|insufficient policy content|semantic review incomplete|semantic review unavailable|possible mismatch only|model suspicion/i.test(
      trimmed
    )
  ) {
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

function isBlockedOrInterstitialSnippet(value: string | null | undefined) {
  return typeof value === "string" && BLOCKED_OR_INTERSTITIAL_TEXT_PATTERN.test(value);
}

function deriveFetchQualityValue(input: {
  attemptedUrls?: string[];
  explicit?: unknown;
  pageUrls?: string[];
  snippets?: string[];
  stopReason?: unknown;
}): FetchQuality | null {
  if (
    input.explicit === "verified_content" ||
    input.explicit === "thin_content" ||
    input.explicit === "blocked_interstitial" ||
    input.explicit === "unreachable"
  ) {
    return input.explicit;
  }

  const attemptedUrls = input.attemptedUrls ?? [];
  const pageUrls = input.pageUrls ?? [];
  const snippets = input.snippets ?? [];
  const stopReason = typeof input.stopReason === "string" ? input.stopReason : null;

  if (
    snippets.some((snippet) => isBlockedOrInterstitialSnippet(snippet)) ||
    (stopReason && /blocked|challenge|captcha|forbidden|auth/i.test(stopReason))
  ) {
    return "blocked_interstitial";
  }
  if (pageUrls.length > 0 && snippets.length > 0) {
    return "verified_content";
  }
  if (pageUrls.length > 0 || snippets.length > 0) {
    return "thin_content";
  }
  if (attemptedUrls.length > 0 || stopReason) {
    return "unreachable";
  }

  return null;
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
  if (CONTEXT_FINDING_IDS.has(id)) {
    return "context";
  }
  if (FINANCIAL_PROMOTION_FINDING_IDS.has(id)) {
    return "financial_promotion";
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
          : typeof input.fallbackEvidence?.mergedSignalConfidence === "number"
            ? input.fallbackEvidence.mergedSignalConfidence
            : null,
      ambiguityScore:
        typeof input.fallbackEvidence?.signalValue === "number" && input.findingId === "policy_clarity_risk"
          ? input.fallbackEvidence.signalValue
          : null
    } satisfies UnifiedFindingDetails;
  }

  if (family === "rights_gap") {
    const validationEvidence =
      input.linkedValidationFinding?.evidence && typeof input.linkedValidationFinding.evidence === "object" && !Array.isArray(input.linkedValidationFinding.evidence)
        ? input.linkedValidationFinding.evidence as Record<string, unknown>
        : null;
    const unmatchedCookieNames = Array.isArray(validationEvidence?.unmatchedCookieNames)
      ? validationEvidence.unmatchedCookieNames
      : Array.isArray(validationEvidence?.unmatched_cookie_names)
        ? validationEvidence.unmatched_cookie_names
        : [];
    return {
      family,
      kind: input.findingId,
      frictionScore:
        typeof input.fallbackEvidence?.consentFrictionDelta === "number"
          ? input.fallbackEvidence.consentFrictionDelta
          : typeof input.fallbackEvidence?.signalValue === "number"
            ? input.fallbackEvidence.signalValue
            : null,
      unmatchedItems: unmatchedCookieNames.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    } satisfies UnifiedFindingDetails;
  }

  if (family === "contradiction") {
    const contradictionEvidence =
      getContradictionEvidenceBundle(input.linkedValidationFinding?.evidence as Record<string, unknown> | null | undefined) ??
      getContradictionEvidenceBundle(input.fallbackEvidence);
    const explicitPolicySnippet =
      getBestExplicitPolicySnippet(
        (input.linkedValidationFinding?.evidence as Record<string, unknown> | null | undefined) ?? input.fallbackEvidence,
        contradictionEvidence
      ) ?? null;
    const vendors = uniqueStrings([
      ...(contradictionEvidence?.runtimeVendors ?? []),
      ...(contradictionEvidence?.relatedVendors ?? [])
    ]);

    return {
      family,
      kind: input.findingId,
      claim:
        contradictionEvidence?.policyAnchor.normalizedClaim ??
        contradictionEvidence?.claim ??
        contradictionEvidence?.contradictionBasis ??
        null,
      contradictionBasis: contradictionEvidence?.contradictionBasis ?? null,
      policyClaimType: contradictionEvidence?.policyAnchor.claimType ?? null,
      runtimeObservationType: contradictionEvidence?.runtimeAnchor.observationType ?? null,
      runtimePhase: contradictionEvidence?.runtimeAnchor.phase ?? null,
      conflictType: contradictionEvidence?.conflictBridge.conflictType ?? null,
      contradictionReviewStatus: contradictionEvidence?.evidenceSufficiency.reviewStatus ?? null,
      policySnippet: explicitPolicySnippet,
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
      ...(Array.isArray(input.linkedValidationFinding?.evidence?.preconsent_violation_vendors)
        ? (input.linkedValidationFinding?.evidence?.preconsent_violation_vendors as string[])
        : []),
      ...(Array.isArray(input.linkedValidationFinding?.evidence?.runtimeVendors)
        ? (input.linkedValidationFinding?.evidence?.runtimeVendors as string[])
        : []),
      ...(Array.isArray(input.fallbackEvidence?.preconsent_tracker_vendors)
        ? (input.fallbackEvidence?.preconsent_tracker_vendors as string[])
        : []),
      ...(Array.isArray(input.linkedValidationFinding?.evidence?.persisted_tracker_vendors)
        ? (input.linkedValidationFinding?.evidence?.persisted_tracker_vendors as string[])
        : []),
      ...(Array.isArray(input.fallbackEvidence?.persisted_tracker_vendors)
        ? (input.fallbackEvidence?.persisted_tracker_vendors as string[])
        : []),
      ...(Array.isArray(input.fallbackEvidence?.post_reject_tracker_vendors)
        ? (input.fallbackEvidence?.post_reject_tracker_vendors as string[])
        : [])
    ]);

    return {
      family,
      kind: input.findingId,
      vendors,
      requestUrls: uniqueStrings([
        ...(Array.isArray(input.linkedValidationFinding?.evidence?.preconsent_tracker_evidence_urls)
          ? (input.linkedValidationFinding?.evidence?.preconsent_tracker_evidence_urls as string[])
          : []),
        ...(Array.isArray(input.linkedValidationFinding?.evidence?.runtimeRequestUrls)
          ? (input.linkedValidationFinding?.evidence?.runtimeRequestUrls as string[])
          : []),
        ...(Array.isArray(input.fallbackEvidence?.preconsent_tracker_evidence_urls)
          ? (input.fallbackEvidence?.preconsent_tracker_evidence_urls as string[])
          : []),
        ...(Array.isArray(input.fallbackEvidence?.runtimeEvidenceUrls)
          ? (input.fallbackEvidence?.runtimeEvidenceUrls as string[])
          : []),
        ...(Array.isArray(input.fallbackEvidence?.consentBaselineTrackerEvidenceUrls)
          ? (input.fallbackEvidence?.consentBaselineTrackerEvidenceUrls as string[])
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

  if (family === "context" || family === "financial_promotion") {
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
      fetchQuality: null as FetchQuality | null,
      flags: [] as string[],
      pageUrls: [] as string[],
      snippets: [] as string[],
      sourceUrls: [] as string[]
    };
  }

  const normalizedFallbackEvidence = normalizeUnifiedFindingEvidenceRecord(fallbackEvidence);
  const accessibilityExampleCoverage = getRepresentativeAccessibilityExampleCoverage(normalizedFallbackEvidence);
  const accessibilityExamplesArePromotable = hasExternallyPromotableAccessibilityExamples(normalizedFallbackEvidence);
  const accessibilityRiskSignalKey =
    typeof normalizedFallbackEvidence.signalKey === "string"
      ? normalizedFallbackEvidence.signalKey
      : typeof normalizedFallbackEvidence.snapshotField === "string"
        ? normalizedFallbackEvidence.snapshotField
        : typeof normalizedFallbackEvidence.unifiedFindingId === "string"
          ? normalizedFallbackEvidence.unifiedFindingId
          : "";
  const isAccessibilityRiskContext =
    /accessibility(?:_|\.)risk|accessibility_litigation_risk_score|wcag_issue_summary|accessibility_risk_score/i.test(
      accessibilityRiskSignalKey
    );
  const accessibilityCoverageSummary =
    accessibilityExampleCoverage.representativeExampleCount > 0
      ? formatRepresentativeAccessibilityCoverage(accessibilityExampleCoverage)
      : null;
  const accessibilityExampleSnippets = formatRepresentativeAccessibilityExampleSnippets(normalizedFallbackEvidence);
  const contradictionEvidence = getContradictionEvidenceBundle(normalizedFallbackEvidence);
  const fallbackSignalKey =
    typeof normalizedFallbackEvidence.signalKey === "string"
      ? normalizedFallbackEvidence.signalKey
      : typeof normalizedFallbackEvidence.snapshotField === "string"
        ? normalizedFallbackEvidence.snapshotField
        : "";
  const isPreconsentRuntimeSignal =
    fallbackSignalKey === "privacy.preconsent_tracking_detected" ||
    fallbackSignalKey === "privacy.tracking_before_consent_detected";
  const explicitPolicySnippetCandidate = getBestExplicitPolicySnippet(normalizedFallbackEvidence, contradictionEvidence);
  const isContradictionEvidenceContext =
    Boolean(contradictionEvidence?.contradictionBasis) ||
    (contradictionEvidence?.runtimeEvidenceArtifacts.length ?? 0) > 0 ||
    (contradictionEvidence?.runtimeVendors.length ?? 0) > 0 ||
    (contradictionEvidence?.relatedVendors.length ?? 0) > 0 ||
    (contradictionEvidence?.supportingSignals.some((signal) => /conflict|misalignment|undisclosed|technical_disclosure/i.test(signal)) ??
      false) ||
    (typeof normalizedFallbackEvidence.unifiedFindingId === "string" &&
      CONTRADICTION_FINDING_IDS.has(normalizedFallbackEvidence.unifiedFindingId)) ||
    (typeof normalizedFallbackEvidence.familyPacketFindingId === "string" &&
      CONTRADICTION_FINDING_IDS.has(normalizedFallbackEvidence.familyPacketFindingId));
  const hasExplicitPolicySnippet =
    isContradictionEvidenceContext &&
    isDistinctExplicitPolicySnippet(explicitPolicySnippetCandidate, contradictionEvidence?.claim);
  const hasExplicitRuntimeArtifact =
    isContradictionEvidenceContext &&
    ((Array.isArray(normalizedFallbackEvidence.runtimeEvidenceArtifacts) &&
      normalizedFallbackEvidence.runtimeEvidenceArtifacts.some((entry) => typeof entry === "string" && entry.trim().length > 0)) ||
      (Array.isArray(normalizedFallbackEvidence.runtimeEvidence) &&
        normalizedFallbackEvidence.runtimeEvidence.some((entry) => typeof entry === "string" && entry.trim().length > 0)) ||
      ((contradictionEvidence?.runtimeAnchor.requests.length ?? 0) > 0) ||
      ((contradictionEvidence?.runtimeAnchor.cookies.length ?? 0) > 0) ||
      ((contradictionEvidence?.runtimeAnchor.storageArtifacts.length ?? 0) > 0));
  const pageUrls = uniqueStrings([
    ...(Array.isArray(normalizedFallbackEvidence.pageUrls) ? (normalizedFallbackEvidence.pageUrls as string[]) : []),
    ...(contradictionEvidence?.policySourceUrl ? [contradictionEvidence.policySourceUrl] : []),
    typeof normalizedFallbackEvidence.pageUrl === "string" ? normalizedFallbackEvidence.pageUrl : null,
    typeof normalizedFallbackEvidence.consentBlockerUrl === "string" ? normalizedFallbackEvidence.consentBlockerUrl : null
  ]);

  const sourceUrls = uniqueStrings([
    ...(Array.isArray(normalizedFallbackEvidence.sourceUrls) ? (normalizedFallbackEvidence.sourceUrls as string[]) : []),
    ...(contradictionEvidence?.sourceUrls ?? []),
    typeof normalizedFallbackEvidence.sourceUrl === "string" ? normalizedFallbackEvidence.sourceUrl : null,
    typeof normalizedFallbackEvidence.pageUrl === "string" ? normalizedFallbackEvidence.pageUrl : null
  ]);
  const sensitivePayloadViolations = Array.isArray(normalizedFallbackEvidence.sensitivePayloadViolations)
    ? (normalizedFallbackEvidence.sensitivePayloadViolations as Array<Record<string, unknown>>)
    : [];

  const snippets = uniqueStrings([
    isMeaningfulPolicyText(normalizedFallbackEvidence.consentBlockerTextSnippet)
      ? normalizedFallbackEvidence.consentBlockerTextSnippet
      : null,
    isMeaningfulPolicyText(normalizedFallbackEvidence.policyChildrenReference)
      ? normalizedFallbackEvidence.policyChildrenReference
      : null,
    contradictionEvidence?.claim,
    contradictionEvidence?.policyAnchor.snippet,
    contradictionEvidence?.policySnippet,
    contradictionEvidence?.runtimeSummary,
    contradictionEvidence?.conflictBridge.reasoning,
    ...(contradictionEvidence?.runtimeEvidenceArtifacts ?? []),
    Array.isArray(normalizedFallbackEvidence.policySnippets) && normalizedFallbackEvidence.policySnippets.length > 0
      ? null
      : isMeaningfulPolicyText(normalizedFallbackEvidence.policySummaryShort)
        ? normalizedFallbackEvidence.policySummaryShort
        : null,
    ...(Array.isArray(normalizedFallbackEvidence.policySnippets)
      ? (normalizedFallbackEvidence.policySnippets as unknown[]).filter((entry): entry is string => isMeaningfulPolicyText(entry))
      : []),
    (Array.isArray(normalizedFallbackEvidence.policySnippets) && normalizedFallbackEvidence.policySnippets.length > 0) ||
    isMeaningfulPolicyText(normalizedFallbackEvidence.policySummaryShort)
      ? null
      : isMeaningfulPolicyText(normalizedFallbackEvidence.signalValue)
        ? normalizedFallbackEvidence.signalValue
        : null,
    ...sensitivePayloadViolations.map((row) => {
      const matchSnippet = typeof row.matchSnippet === "string" ? row.matchSnippet.trim() : null;
      if (matchSnippet) {
        return matchSnippet;
      }

      const detectedType =
        typeof row.detectedType === "string" ? row.detectedType.replace(/_detected$/i, "").replace(/_/g, " ") : null;
      const sourceField = typeof row.sourceField === "string" ? row.sourceField.trim() : null;
      const requestMethod = typeof row.requestMethod === "string" ? row.requestMethod.trim().toUpperCase() : null;
      const requestUrl = typeof row.requestUrl === "string" ? row.requestUrl.trim() : null;
      const vendorHost = typeof row.vendorHost === "string" ? row.vendorHost.trim() : null;
      const evidenceStrength = typeof row.evidenceStrength === "string" ? row.evidenceStrength.trim() : null;

      const parts = uniqueStrings([
        detectedType ? `${detectedType} data` : null,
        sourceField ? `field ${sourceField}` : null,
        requestMethod && requestUrl ? `${requestMethod} ${requestUrl}` : requestUrl,
        vendorHost && vendorHost !== getHostnameFromUrl(requestUrl) ? `host ${vendorHost}` : null,
        evidenceStrength ? `${evidenceStrength} evidence` : null
      ]);

      return parts.length > 0 ? parts.join(" | ") : null;
    }),
    accessibilityCoverageSummary,
    ...accessibilityExampleSnippets
  ])
    .map((snippet) => normalizePolicySnippet(snippet))
    .filter((snippet): snippet is string => typeof snippet === "string" && !/^topic:[a-z0-9_:-]+$/i.test(snippet));

  const counts: Record<string, number> = {};
  for (const key of [
    "consentFrictionDelta",
    "consentOptInClicks",
    "consentOptOutClicks",
    "keyPageAttemptCount",
    "policyCoverageRatio",
    "policy_coverage_ratio",
    "policySemanticConfidence",
    "policy_semantic_confidence",
    "unmatchedCookieCount",
    "unmatched_cookie_count",
    "unmatchedThirdPartyCookieCount",
    "unmatched_third_party_cookie_count",
    "firstRequestMs",
    "firstThirdPartyRequestMs",
    "firstCookieSeenMs",
    "cmpVisibleMs"
  ]) {
    const value = normalizedFallbackEvidence[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      counts[key] = value;
    }
  }
  if (normalizedFallbackEvidence.cookieAttributeSummary && typeof normalizedFallbackEvidence.cookieAttributeSummary === "object") {
    const summary = normalizedFallbackEvidence.cookieAttributeSummary as Record<string, unknown>;
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
  if (normalizedFallbackEvidence.gpcVerification && typeof normalizedFallbackEvidence.gpcVerification === "object") {
    const verification = normalizedFallbackEvidence.gpcVerification as Record<string, unknown>;
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
  if (
    typeof normalizedFallbackEvidence.childrenPrivacyRiskScore === "number" &&
    Number.isFinite(normalizedFallbackEvidence.childrenPrivacyRiskScore)
  ) {
    counts.childrenPrivacyRiskScore = normalizedFallbackEvidence.childrenPrivacyRiskScore;
  }
  if (accessibilityExampleCoverage.representativeExampleCount > 0) {
    counts.representativeAxeExampleCount = accessibilityExampleCoverage.representativeExampleCount;
    counts.representativeAxePageCount = accessibilityExampleCoverage.distinctPageCount;
    counts.representativeAxeRuleCount = accessibilityExampleCoverage.distinctRuleCount;
  }
  if (
    isAccessibilityRiskContext &&
    typeof normalizedFallbackEvidence.value === "number" &&
    Number.isFinite(normalizedFallbackEvidence.value)
  ) {
    counts.accessibilityRiskScore = normalizedFallbackEvidence.value;
  }

  const entities: Record<string, string[]> = {};
  if (Array.isArray(normalizedFallbackEvidence.keyPageAttemptedUrls)) {
    entities.attemptedUrls = uniqueStrings(normalizedFallbackEvidence.keyPageAttemptedUrls as string[]);
  }
  if (Array.isArray(normalizedFallbackEvidence.policyBoilerplateSignals)) {
    entities.policyBoilerplateSignals = uniqueStrings(normalizedFallbackEvidence.policyBoilerplateSignals as string[]);
  }
  if (Array.isArray(normalizedFallbackEvidence.policyPositiveSnippetKeys)) {
    entities.policyPositiveSnippetKeys = uniqueStrings(normalizedFallbackEvidence.policyPositiveSnippetKeys as string[]);
  }
  if (Array.isArray(normalizedFallbackEvidence.offerSnippets)) {
    entities.offerSnippets = uniqueStrings(normalizedFallbackEvidence.offerSnippets as string[]);
  }
  if (typeof normalizedFallbackEvidence.primaryOfferSnippet === "string" && normalizedFallbackEvidence.primaryOfferSnippet.trim()) {
    entities.primaryOfferSnippet = [normalizedFallbackEvidence.primaryOfferSnippet.trim()];
  }
  if (typeof normalizedFallbackEvidence.responsibleGamblingDisclosureAdjacent === "boolean") {
    entities.responsibleGamblingDisclosureAdjacent = [String(normalizedFallbackEvidence.responsibleGamblingDisclosureAdjacent)];
  }
  if (Array.isArray(normalizedFallbackEvidence.responsibleGamblingSnippets)) {
    entities.responsibleGamblingSnippets = uniqueStrings(normalizedFallbackEvidence.responsibleGamblingSnippets as string[]);
  }
  if (typeof normalizedFallbackEvidence.termsDisclosureAdjacent === "boolean") {
    entities.termsDisclosureAdjacent = [String(normalizedFallbackEvidence.termsDisclosureAdjacent)];
  }
  if (Array.isArray(normalizedFallbackEvidence.termsSnippets)) {
    entities.termsSnippets = uniqueStrings(normalizedFallbackEvidence.termsSnippets as string[]);
  }
  if (typeof normalizedFallbackEvidence.privacyContactChannelType === "string" && normalizedFallbackEvidence.privacyContactChannelType.trim()) {
    entities.privacyContactChannelType = [normalizedFallbackEvidence.privacyContactChannelType.trim()];
  }
  const policyDsarMechanism =
    typeof normalizedFallbackEvidence.policyDsarMechanism === "string"
      ? normalizedFallbackEvidence.policyDsarMechanism
      : typeof normalizedFallbackEvidence.policy_dsar_mechanism === "string"
        ? normalizedFallbackEvidence.policy_dsar_mechanism
        : null;
  if (policyDsarMechanism && policyDsarMechanism.trim()) {
    entities.policyDsarMechanism = [policyDsarMechanism.trim()];
  }
  const policyRightsSignals = uniqueStrings([
    ...(Array.isArray(normalizedFallbackEvidence.policyRightsSignals) ? (normalizedFallbackEvidence.policyRightsSignals as string[]) : []),
    ...(Array.isArray(normalizedFallbackEvidence.policy_rights_signals) ? (normalizedFallbackEvidence.policy_rights_signals as string[]) : [])
  ]);
  if (policyRightsSignals.length > 0) {
    entities.policyRightsSignals = policyRightsSignals;
  }
  if (Array.isArray(normalizedFallbackEvidence.relatedVendors)) {
    entities.relatedVendors = uniqueStrings(normalizedFallbackEvidence.relatedVendors as string[]);
  }
  if ((contradictionEvidence?.relatedVendors.length ?? 0) > 0) {
    entities.relatedVendors = uniqueStrings([...(entities.relatedVendors ?? []), ...((contradictionEvidence?.relatedVendors ?? []) as string[])]);
  }
  if (Array.isArray(normalizedFallbackEvidence.runtimeVendors)) {
    entities.runtimeVendors = uniqueStrings(normalizedFallbackEvidence.runtimeVendors as string[]);
  }
  if ((contradictionEvidence?.runtimeVendors.length ?? 0) > 0) {
    entities.runtimeVendors = uniqueStrings([...(entities.runtimeVendors ?? []), ...((contradictionEvidence?.runtimeVendors ?? []) as string[])]);
  }
  if (Array.isArray(normalizedFallbackEvidence.videoTitleSnippets)) {
    entities.videoTitleSnippets = uniqueStrings(normalizedFallbackEvidence.videoTitleSnippets as string[]);
  }
  if (Array.isArray(normalizedFallbackEvidence.videoPageUrls)) {
    entities.videoPageUrls = uniqueStrings(normalizedFallbackEvidence.videoPageUrls as string[]);
  }
  if (Array.isArray(normalizedFallbackEvidence.metaPixelPayloadFieldHints)) {
    entities.metaPixelPayloadFieldHints = uniqueStrings(normalizedFallbackEvidence.metaPixelPayloadFieldHints as string[]);
  }
  if (Array.isArray(normalizedFallbackEvidence.metaPixelRuntimePhases)) {
    entities.metaPixelRuntimePhases = uniqueStrings(normalizedFallbackEvidence.metaPixelRuntimePhases as string[]);
  }
  const sensitivePayloadRequestUrls = uniqueStrings(
    sensitivePayloadViolations.map((row) => (typeof row.requestUrl === "string" ? row.requestUrl : null))
  ).filter(isConcreteHttpEvidenceUrl);
  if (sensitivePayloadRequestUrls.length > 0) {
    entities.request_urls = sensitivePayloadRequestUrls;
  }
  const sensitivePayloadRequestDomains = uniqueStrings(
    sensitivePayloadViolations.map((row) => {
      if (typeof row.vendorHost === "string" && row.vendorHost.trim().length > 0) {
        return row.vendorHost.trim();
      }

      return typeof row.requestUrl === "string" ? getHostnameFromUrl(row.requestUrl) : null;
    })
  );
  if (sensitivePayloadRequestDomains.length > 0) {
    entities.request_domains = sensitivePayloadRequestDomains;
    entities.third_party_domains = sensitivePayloadRequestDomains;
    entities.vendors = sensitivePayloadRequestDomains;
  }
  const sensitivePayloadDataTypes = uniqueStrings(
    sensitivePayloadViolations.map((row) => (typeof row.detectedType === "string" ? row.detectedType.trim() : null))
  );
  if (sensitivePayloadDataTypes.length > 0) {
    entities.sensitive_data_types = sensitivePayloadDataTypes;
  }
  const sensitivePayloadSourceFields = uniqueStrings(
    sensitivePayloadViolations.map((row) => (typeof row.sourceField === "string" ? row.sourceField.trim() : null))
  );
  if (sensitivePayloadSourceFields.length > 0) {
    entities.sensitive_source_fields = sensitivePayloadSourceFields;
  }
  const sensitivePayloadSourceLocations = uniqueStrings(
    sensitivePayloadViolations.map((row) => (typeof row.sourceLocation === "string" ? row.sourceLocation.trim() : null))
  );
  if (sensitivePayloadSourceLocations.length > 0) {
    entities.sensitive_source_locations = sensitivePayloadSourceLocations;
  }
  const runtimeRequestUrls = uniqueStrings([
    ...(Array.isArray(normalizedFallbackEvidence.requestUrls) ? (normalizedFallbackEvidence.requestUrls as string[]) : []),
    ...(Array.isArray(normalizedFallbackEvidence.runtimeEvidenceUrls) ? (normalizedFallbackEvidence.runtimeEvidenceUrls as string[]) : []),
    ...(Array.isArray(normalizedFallbackEvidence.runtimeRequestUrls) ? (normalizedFallbackEvidence.runtimeRequestUrls as string[]) : []),
    ...(Array.isArray(normalizedFallbackEvidence.metaPixelRequestUrls) ? (normalizedFallbackEvidence.metaPixelRequestUrls as string[]) : []),
    ...(Array.isArray(normalizedFallbackEvidence.preconsent_tracker_evidence_urls)
      ? (normalizedFallbackEvidence.preconsent_tracker_evidence_urls as string[])
      : []),
    ...sensitivePayloadRequestUrls,
    ...(isPreconsentRuntimeSignal && Array.isArray(normalizedFallbackEvidence.sourceUrls)
      ? (normalizedFallbackEvidence.sourceUrls as string[])
      : []),
    ...(contradictionEvidence?.runtimeAnchor.requests ?? [])
  ]).filter(isConcreteHttpEvidenceUrl);
  if (runtimeRequestUrls.length > 0) {
    entities.runtimeRequestUrls = runtimeRequestUrls;
  }
  const runtimeCookieNames = uniqueStrings([
    ...(Array.isArray(normalizedFallbackEvidence.runtimeCookieNames) ? (normalizedFallbackEvidence.runtimeCookieNames as string[]) : []),
    ...(Array.isArray(normalizedFallbackEvidence.runtime_cookie_names) ? (normalizedFallbackEvidence.runtime_cookie_names as string[]) : []),
    ...(Array.isArray(normalizedFallbackEvidence.unmatchedCookieNames) ? (normalizedFallbackEvidence.unmatchedCookieNames as string[]) : []),
    ...(Array.isArray(normalizedFallbackEvidence.unmatched_cookie_names) ? (normalizedFallbackEvidence.unmatched_cookie_names as string[]) : [])
  ]);
  if (runtimeCookieNames.length > 0) {
    entities.runtime_cookie_names = runtimeCookieNames;
  }
  const unmatchedCookieNames = uniqueStrings([
    ...(Array.isArray(normalizedFallbackEvidence.unmatchedCookieNames) ? (normalizedFallbackEvidence.unmatchedCookieNames as string[]) : []),
    ...(Array.isArray(normalizedFallbackEvidence.unmatched_cookie_names) ? (normalizedFallbackEvidence.unmatched_cookie_names as string[]) : [])
  ]);
  if (unmatchedCookieNames.length > 0) {
    entities.unmatched_cookie_names = unmatchedCookieNames;
  }
  const runtimeCookieVendors = uniqueStrings([
    ...(Array.isArray(normalizedFallbackEvidence.runtimeCookieVendors) ? (normalizedFallbackEvidence.runtimeCookieVendors as string[]) : []),
    ...(Array.isArray(normalizedFallbackEvidence.runtime_cookie_vendors) ? (normalizedFallbackEvidence.runtime_cookie_vendors as string[]) : []),
    ...(Array.isArray(normalizedFallbackEvidence.unmatchedCookieVendors) ? (normalizedFallbackEvidence.unmatchedCookieVendors as string[]) : []),
    ...(Array.isArray(normalizedFallbackEvidence.unmatched_cookie_vendors) ? (normalizedFallbackEvidence.unmatched_cookie_vendors as string[]) : [])
  ]);
  if (runtimeCookieVendors.length > 0) {
    entities.runtime_cookie_vendors = runtimeCookieVendors;
  }
  const preconsentCookieNames = uniqueStrings([
    ...(Array.isArray(normalizedFallbackEvidence.preconsent_cookie_names)
      ? (normalizedFallbackEvidence.preconsent_cookie_names as string[])
      : []),
    ...(Array.isArray(normalizedFallbackEvidence.preconsentCookieNames)
      ? (normalizedFallbackEvidence.preconsentCookieNames as string[])
      : [])
  ]);
  if (preconsentCookieNames.length > 0) {
    entities.preconsent_cookie_names = preconsentCookieNames;
  }
  const preconsentNonessentialCookieNames = uniqueStrings([
    ...(Array.isArray(normalizedFallbackEvidence.preconsent_nonessential_cookie_names)
      ? (normalizedFallbackEvidence.preconsent_nonessential_cookie_names as string[])
      : []),
    ...(Array.isArray(normalizedFallbackEvidence.preconsentNonessentialCookieNames)
      ? (normalizedFallbackEvidence.preconsentNonessentialCookieNames as string[])
      : [])
  ]);
  if (preconsentNonessentialCookieNames.length > 0) {
    entities.preconsent_nonessential_cookie_names = preconsentNonessentialCookieNames;
  }
  const preconsentCookieCategories = uniqueStrings([
    ...(Array.isArray(normalizedFallbackEvidence.preconsent_cookie_categories)
      ? (normalizedFallbackEvidence.preconsent_cookie_categories as string[])
      : []),
    ...(Array.isArray(normalizedFallbackEvidence.preconsentCookieCategories)
      ? (normalizedFallbackEvidence.preconsentCookieCategories as string[])
      : [])
  ]);
  if (preconsentCookieCategories.length > 0) {
    entities.preconsent_cookie_categories = preconsentCookieCategories;
  }
  const preconsentCookieEvidenceRows = [
    ...(Array.isArray(normalizedFallbackEvidence.preconsent_cookie_evidence)
      ? (normalizedFallbackEvidence.preconsent_cookie_evidence as Array<Record<string, unknown>>)
      : []),
    ...(Array.isArray(normalizedFallbackEvidence.preconsentCookieEvidence)
      ? (normalizedFallbackEvidence.preconsentCookieEvidence as Array<Record<string, unknown>>)
      : [])
  ];
  const preconsentCookieInitiatorVendors = uniqueStrings([
    ...(Array.isArray(normalizedFallbackEvidence.preconsent_cookie_initiator_vendors)
      ? (normalizedFallbackEvidence.preconsent_cookie_initiator_vendors as string[])
      : []),
    ...(Array.isArray(normalizedFallbackEvidence.preconsentCookieInitiatorVendors)
      ? (normalizedFallbackEvidence.preconsentCookieInitiatorVendors as string[])
      : []),
    ...preconsentCookieEvidenceRows.map((row) => typeof row.initiatorVendor === "string" ? row.initiatorVendor : null)
  ]);
  if (preconsentCookieInitiatorVendors.length > 0) {
    entities.preconsent_cookie_initiator_vendors = preconsentCookieInitiatorVendors;
  }
  const preconsentCookieInitiatorDomains = uniqueStrings([
    ...(Array.isArray(normalizedFallbackEvidence.preconsent_cookie_initiator_domains)
      ? (normalizedFallbackEvidence.preconsent_cookie_initiator_domains as string[])
      : []),
    ...(Array.isArray(normalizedFallbackEvidence.preconsentCookieInitiatorDomains)
      ? (normalizedFallbackEvidence.preconsentCookieInitiatorDomains as string[])
      : []),
    ...preconsentCookieEvidenceRows.map((row) => typeof row.initiatorDomain === "string" ? row.initiatorDomain : null)
  ]);
  if (preconsentCookieInitiatorDomains.length > 0) {
    entities.preconsent_cookie_initiator_domains = preconsentCookieInitiatorDomains;
  }
  const preconsentCookieInitiatorUrls = uniqueStrings([
    ...(Array.isArray(normalizedFallbackEvidence.preconsent_cookie_initiator_urls)
      ? (normalizedFallbackEvidence.preconsent_cookie_initiator_urls as string[])
      : []),
    ...(Array.isArray(normalizedFallbackEvidence.preconsentCookieInitiatorUrls)
      ? (normalizedFallbackEvidence.preconsentCookieInitiatorUrls as string[])
      : []),
    ...preconsentCookieEvidenceRows.map((row) => typeof row.initiatorUrl === "string" ? row.initiatorUrl : null)
  ]);
  if (preconsentCookieInitiatorUrls.length > 0) {
    entities.preconsent_cookie_initiator_urls = preconsentCookieInitiatorUrls;
  }
  const preconsentTrackerVendors = uniqueStrings([
    ...(Array.isArray(normalizedFallbackEvidence.preconsent_tracker_vendors)
      ? (normalizedFallbackEvidence.preconsent_tracker_vendors as string[])
      : []),
    ...(Array.isArray(normalizedFallbackEvidence.preconsentTrackerVendors)
      ? (normalizedFallbackEvidence.preconsentTrackerVendors as string[])
      : [])
  ]);
  if (preconsentTrackerVendors.length > 0) {
    entities.preconsent_tracker_vendors = preconsentTrackerVendors;
  }
  const preconsentCookieTimingEvidence = uniqueStrings([
    ...(Array.isArray(normalizedFallbackEvidence.preconsent_cookie_timing_evidence)
      ? (normalizedFallbackEvidence.preconsent_cookie_timing_evidence as string[])
      : []),
    ...(Array.isArray(normalizedFallbackEvidence.preconsentCookieTimingEvidence)
      ? (normalizedFallbackEvidence.preconsentCookieTimingEvidence as string[])
      : []),
    ...(Array.isArray(normalizedFallbackEvidence.preconsent_cookie_evidence)
      ? (normalizedFallbackEvidence.preconsent_cookie_evidence as Array<Record<string, unknown>>).map((row) =>
          typeof row.timingEvidence === "string"
            ? row.timingEvidence
            : typeof row.timing_evidence === "string"
              ? row.timing_evidence
              : null
        )
      : []),
    ...(Array.isArray(normalizedFallbackEvidence.preconsentCookieEvidence)
      ? (normalizedFallbackEvidence.preconsentCookieEvidence as Array<Record<string, unknown>>).map((row) =>
          typeof row.timingEvidence === "string"
            ? row.timingEvidence
            : typeof row.timing_evidence === "string"
              ? row.timing_evidence
              : null
        )
      : [])
  ]);
  if (preconsentCookieTimingEvidence.length > 0) {
    entities.preconsent_cookie_timing_evidence = preconsentCookieTimingEvidence;
  }
  if (normalizedFallbackEvidence.cookieAttributeSummary && typeof normalizedFallbackEvidence.cookieAttributeSummary === "object") {
    const summary = normalizedFallbackEvidence.cookieAttributeSummary as Record<string, unknown>;
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
  if (accessibilityExampleCoverage.maxImpact) {
    entities.maxAxeImpact = [accessibilityExampleCoverage.maxImpact];
  }

  const flags = uniqueStrings([
    typeof normalizedFallbackEvidence.familyPacketFamilyId === "string" ? "family_packet_backed" : null,
    typeof normalizedFallbackEvidence.familyPacketFamilyId === "string"
      ? `family_packet:${normalizedFallbackEvidence.familyPacketFamilyId}`
      : null,
    typeof normalizedFallbackEvidence.familyPacketFindingId === "string"
      ? `family_packet_finding:${normalizedFallbackEvidence.familyPacketFindingId}`
      : null,
    normalizedFallbackEvidence.keyPageGuessedOnly === true ? "guessed_only" : null,
    normalizedFallbackEvidence.consentRedirectOrAuthRequired === true ? "redirect_or_auth_required" : null,
    normalizedFallbackEvidence.gpcVerification &&
    typeof normalizedFallbackEvidence.gpcVerification === "object" &&
    (normalizedFallbackEvidence.gpcVerification as { status?: unknown }).status === "ignored"
      ? "gpc_ignored"
      : null,
    normalizedFallbackEvidence.ageGatePresent === true ? "age_gate_present" : null,
    normalizedFallbackEvidence.childrenAudienceLikely === true ? "children_audience_likely" : null,
    normalizedFallbackEvidence.kidDirectedContentDetected === true ? "kid_directed_content_detected" : null,
    normalizedFallbackEvidence.parentalConsentReferencePresent === true ? "parental_consent_reference_present" : null,
    normalizedFallbackEvidence.mentionsCoppa === true ? "mentions_coppa" : null,
    normalizedFallbackEvidence.mentionsUnder13 === true ? "mentions_under_13" : null,
    normalizedFallbackEvidence.mentionsUnder16 === true ? "mentions_under_16" : null,
    normalizedFallbackEvidence.formCollectsBirthdate === true ? "form_collects_birthdate" : null,
    normalizedFallbackEvidence.dateOfBirthInputPresent === true ? "date_of_birth_input_present" : null,
    Array.isArray(normalizedFallbackEvidence.policyBoilerplateSignals) &&
    normalizedFallbackEvidence.policyBoilerplateSignals.some((entry) => typeof entry === "string" && entry.trim().length > 0)
      ? "policy_boilerplate_signals_retained"
      : null,
    typeof normalizedFallbackEvidence.policyPositiveTopic === "string"
      ? `policy_positive_topic:${normalizedFallbackEvidence.policyPositiveTopic}`
      : null,
    normalizedFallbackEvidence.policyStructurallyWeak === true || normalizedFallbackEvidence.policy_structurally_weak === true
      ? "policy_structurally_weak"
      : null,
    normalizedFallbackEvidence.policyExtractionStatus === "structurally_weak" ||
    normalizedFallbackEvidence.policy_extraction_status === "structurally_weak"
      ? "policy_extraction_status:structurally_weak"
      : null,
    /^absent|none|missing|not_found$/i.test(policyDsarMechanism ?? "") ||
    normalizedFallbackEvidence.sectionReviewNoDsarMechanism === true ||
    normalizedFallbackEvidence.section_review_no_dsar_mechanism === true
      ? "policy_field:dsar_path:absent"
      : null,
    policyDsarMechanism && !/^absent|none|missing|not_found|unknown|null$/i.test(policyDsarMechanism)
      ? "policy_field:dsar_path:found"
      : null,
    hasExplicitPolicySnippet ? "explicit_policy_snippet_retained" : null,
    hasExplicitRuntimeArtifact ? "contradiction_runtime_artifact_retained" : null,
    accessibilityExampleCoverage.representativeExampleCount > 0
      ? "representative_accessibility_examples_retained"
      : null,
    isAccessibilityRiskContext && accessibilityExampleCoverage.representativeExampleCount === 0
      ? "accessibility_score_only_audit_context"
      : null,
    accessibilityExampleCoverage.representativeExampleCount > 0 && !accessibilityExamplesArePromotable
      ? "accessibility_examples_below_promotion_threshold"
      : null,
    hasSanitizedNetworkEvidenceHash(normalizedFallbackEvidence) ? "sanitized_network_evidence_hashed" : null,
    ...getPolicyFieldCoverageFlags(normalizedFallbackEvidence),
    ...(contradictionEvidence?.supportingSignals ?? []),
    typeof normalizedFallbackEvidence.signalKey === "string" ? normalizedFallbackEvidence.signalKey : null
  ]);

  return {
    counts,
    entities,
    fetchQuality: deriveFetchQualityValue({
      attemptedUrls: Array.isArray(normalizedFallbackEvidence.keyPageAttemptedUrls)
        ? normalizedFallbackEvidence.keyPageAttemptedUrls.filter((value): value is string => typeof value === "string")
        : [],
      explicit: normalizedFallbackEvidence.fetchQuality ?? normalizedFallbackEvidence.normalizedConcernFetchQuality,
      pageUrls,
      snippets,
      stopReason: normalizedFallbackEvidence.keyPageStopReason
    }),
    flags,
    pageUrls,
    snippets,
    sourceUrls
  };
}

function extractEvidenceFromValidationFinding(finding?: ScanValidationFinding | null) {
  if (!finding?.evidence) {
    return {
      counts: {} as Record<string, number>,
      entities: {} as Record<string, string[]>,
      fetchQuality: null as FetchQuality | null,
      flags: [] as string[],
      pageUrls: [] as string[],
      snippets: [] as string[],
      sourceUrls: [] as string[]
    };
  }

  const evidence = normalizeUnifiedFindingEvidenceRecord(finding.evidence as Record<string, unknown>);
  const contradictionEvidence = getContradictionEvidenceBundle(evidence);
  const explicitPolicySnippetCandidate = getBestExplicitPolicySnippet(evidence, contradictionEvidence);
  const isContradictionEvidenceContext =
    Boolean(contradictionEvidence?.contradictionBasis) ||
    (contradictionEvidence?.runtimeEvidenceArtifacts.length ?? 0) > 0 ||
    (contradictionEvidence?.runtimeVendors.length ?? 0) > 0 ||
    (contradictionEvidence?.relatedVendors.length ?? 0) > 0 ||
    (contradictionEvidence?.supportingSignals.some((signal) => /conflict|misalignment|undisclosed|technical_disclosure/i.test(signal)) ?? false) ||
    (typeof evidence.unifiedFindingId === "string" && CONTRADICTION_FINDING_IDS.has(evidence.unifiedFindingId));
  const hasExplicitPolicySnippet =
    isContradictionEvidenceContext &&
    isDistinctExplicitPolicySnippet(explicitPolicySnippetCandidate, contradictionEvidence?.claim);
  const hasExplicitRuntimeArtifact =
    isContradictionEvidenceContext &&
    ((Array.isArray(evidence.runtimeEvidenceArtifacts) &&
      evidence.runtimeEvidenceArtifacts.some((entry) => typeof entry === "string" && entry.trim().length > 0)) ||
    (Array.isArray(evidence.runtimeEvidence) &&
      evidence.runtimeEvidence.some((entry) => typeof entry === "string" && entry.trim().length > 0)) ||
    ((contradictionEvidence?.runtimeAnchor.requests.length ?? 0) > 0) ||
    ((contradictionEvidence?.runtimeAnchor.cookies.length ?? 0) > 0) ||
    ((contradictionEvidence?.runtimeAnchor.storageArtifacts.length ?? 0) > 0));
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
        if (key === "pageUrl") {
          pageUrls.add(value);
        } else if (key === "sourceUrl") {
          sourceUrls.add(value);
        } else {
          sourceUrls.add(value);
        }
      } else if (key === "policyDsarMechanism" || key === "policy_dsar_mechanism") {
        addEntity("policyDsarMechanism", [value]);
      } else if (
        (key === "policyExtractionStatus" || key === "policy_extraction_status") &&
        value.trim() === "structurally_weak"
      ) {
        flags.add("policy_extraction_status:structurally_weak");
      } else if (/claim|observed|summary|snippet|evidence|description|rationale/i.test(key) && isReviewerFacingSnippet(value)) {
        snippets.add(value);
      }
      continue;
    }

    if (typeof value === "number" && Number.isFinite(value)) {
      if (/count|score|confidence|delta|attempt|ratio/i.test(key)) {
        counts[key] = value;
      }
      continue;
    }

    if (value === true) {
      flags.add(key);
      if (key === "policyStructurallyWeak" || key === "policy_structurally_weak") {
        flags.add("policy_structurally_weak");
      }
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
        if (key === "pageUrls") {
          pageUrls.add(entry);
        } else if (key === "sourceUrls") {
          sourceUrls.add(entry);
        } else {
          sourceUrls.add(entry);
        }
      }
    } else if (key === "policyRightsSignals" || key === "policy_rights_signals") {
      addEntity("policyRightsSignals", stringValues);
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
    fetchQuality: deriveFetchQualityValue({
      explicit: evidence.fetchQuality ?? evidence.normalizedConcernFetchQuality,
      pageUrls: [...pageUrls],
      snippets: [...snippets]
    }),
    flags: [
      ...flags,
      ...(hasExplicitPolicySnippet ? ["explicit_policy_snippet_retained"] : []),
      ...(hasExplicitRuntimeArtifact ? ["contradiction_runtime_artifact_retained"] : []),
      ...(hasSanitizedNetworkEvidenceHash(evidence) ? ["sanitized_network_evidence_hashed"] : []),
      ...getPolicyFieldCoverageFlags(evidence)
    ],
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
  const flags = uniqueStrings([...(current?.flags ?? []), ...(next.flags ?? []), ...(validationEvidence.flags ?? [])]);

  return {
    counts: { ...(current?.counts ?? {}), ...(next.counts ?? {}), ...(validationEvidence.counts ?? {}) },
    entities: {
      ...(current?.entities ?? {}),
      ...(next.entities ?? {}),
      ...(validationEvidence.entities ?? {})
    },
    fetchQuality: current?.fetchQuality ?? next.fetchQuality ?? validationEvidence.fetchQuality ?? null,
    flags,
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

function isConcreteHttpEvidenceUrl(value: string | null | undefined) {
  if (!value) {
    return false;
  }
  try {
    const parsed = new URL(value);
    return (
      (parsed.protocol === "https:" || parsed.protocol === "http:") &&
      parsed.hostname.includes(".") &&
      !parsed.hostname.includes("_")
    );
  } catch {
    return false;
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

function isContactLikeUrl(value: string | null | undefined) {
  if (!value) {
    return false;
  }

  try {
    const parsed = new URL(value);
    return /contact|help|support|feedback|chat|customer-service/i.test(parsed.pathname);
  } catch {
    return /contact|help|support|feedback|chat|customer-service/i.test(value);
  }
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

function isLowSignalBrandSnippet(value: string | null | undefined) {
  if (!value) {
    return false;
  }

  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > 40) {
    return false;
  }

  const wordCount = trimmed.split(/\s+/).length;
  return wordCount <= 4 && /^[A-Z][A-Za-z&'.-]*(?:\s+[A-Z][A-Za-z&'.-]*)*$/.test(trimmed);
}

function isPolicyPositiveMarkerSnippet(value: string | null | undefined) {
  return Boolean(
    value &&
      /^(?:topic:[a-z0-9_:-]+|dsar|access|delete|correct|correction|export|manage|state_rights|authorized_agent|appeal|privacy_controls|privacy_contact|tracking_technologies_disclosure|targeted_advertising_disclosure|behavioral_analytics_disclosure|session_replay_disclosure|product_analytics_disclosure)$/i.test(
        value.trim()
      )
  );
}

function isReadableSurfaceSnippet(value: string | null | undefined) {
  if (!value) {
    return false;
  }

  const normalized = normalizePolicySnippet(value);
  return Boolean(
    normalized &&
      isReviewerFacingSnippet(normalized) &&
      !isBlockedOrInterstitialSnippet(normalized) &&
      !isLikelyHomepageTitle(normalized) &&
      !isLowSignalBrandSnippet(normalized)
  );
}

function hasFindingSpecificSurfaceSnippet(findingId: string, snippets: string[] | undefined) {
  const readableSnippets = (snippets ?? []).filter(isReadableSurfaceSnippet);
  if (readableSnippets.length === 0) {
    return false;
  }

  if (findingId === "contact_support_path_present") {
    return readableSnippets.some((snippet) => /(contact|support|help|feedback|phone|chat|branch|advisor|service)/i.test(snippet));
  }

  if (findingId === "cookie_policy_present") {
    return readableSnippets.some(
      (snippet) => /(cookie|tracking|privacy choices|privacy settings|manage cookies|analytical cookies|marketing cookies)/i.test(snippet)
    );
  }

  if (findingId === "privacy_policy_present") {
    return readableSnippets.some((snippet) => /(privacy policy|privacy notice)/i.test(snippet));
  }

  if (findingId === "privacy_rights_path_present") {
    return readableSnippets.some(
      (snippet) => /(privacy rights|right to access|right to request|delete request|access request|correction request|data request|exercise (?:your )?rights|submit (?:a )?request)/i.test(
        snippet
      )
    );
  }

  if (findingId === "tracking_technologies_disclosure_present") {
    return readableSnippets.some((snippet) =>
      /tracking technolog(?:y|ies)|cookies? and similar technolog(?:y|ies)|pixels?|web beacons?|tags?|tracking scripts?|software development kits?|\bSDKs?\b/i.test(
        snippet
      )
    );
  }

  if (findingId === "targeted_advertising_disclosure_present") {
    return readableSnippets.some((snippet) =>
      /targeted advertis(?:e|ing)|interest-based advertis(?:e|ing)|personalized ads?|cross-context behavioral advertis(?:e|ing)|sale or sharing|sell or share/i.test(
        snippet
      )
    );
  }

  if (findingId === "behavioral_analytics_disclosure_present") {
    return readableSnippets.some((snippet) =>
      /behavioral analytics|behavioural analytics|session replay|session recording|heat ?map|product analytics|hotjar|fullstory|mouseflow|contentsquare|microsoft clarity|google analytics.{0,160}(?:behavioral data|track (?:your )?use|understand how (?:visitors?|users?) use)|analytics tools?.{0,120}(?:understand|measure|analy[sz]e).{0,120}(?:visitors?|users?|use of (?:our )?(?:services?|site|website))|mouse movements?|clicks?|keystrokes?|pages visited|observe (?:how )?(?:visitors|users)/i.test(
        snippet
      )
    );
  }

  if (findingId === "terms_of_service_present") {
    return readableSnippets.some((snippet) => /(terms of service|terms and conditions|terms of use)/i.test(snippet));
  }

  if (findingId === "affiliate_disclosure_present" || findingId === "affiliate_disclosure_scope_limited") {
    return readableSnippets.some((snippet) => /(affiliate|commission|we may earn|partner links?)/i.test(snippet));
  }

  return readableSnippets.length > 0;
}

function getFindingSpecificSnippetScore(findingId: string, snippet: string) {
  const normalized = snippet.trim();
  if (normalized.length === 0) {
    return -100;
  }

  let score = isReadableSurfaceSnippet(normalized) ? 10 : 0;
  if (hasFindingSpecificSurfaceSnippet(findingId, [normalized])) {
    score += 25;
  }

  if (findingId === "privacy_policy_present") {
    if (/affiliate disclosure/i.test(normalized)) {
      score -= 20;
    }
    if (/privacy policy|privacy notice/i.test(normalized)) {
      score += 10;
    }
  }

  if (findingId === "privacy_rights_path_present") {
    if (/affiliate disclosure/i.test(normalized)) {
      score -= 20;
    }
    if (/privacy rights|right to access|right to request|delete request|access request|correction request/i.test(normalized)) {
      score += 12;
    }
  }

  if (findingId === "terms_of_service_present") {
    if (/terms of service|terms and conditions|terms of use/i.test(normalized)) {
      score += 10;
    }
  }

  if (findingId === "affiliate_disclosure_present" || findingId === "affiliate_disclosure_scope_limited") {
    if (/affiliate|commission|we may earn|partner links?/i.test(normalized)) {
      score += 10;
    }
  }

  return score;
}

function rankSnippetsForFinding(findingId: string, snippets: string[]) {
  return [...snippets].sort((left, right) => getFindingSpecificSnippetScore(findingId, right) - getFindingSpecificSnippetScore(findingId, left));
}

function hasCorroboratedPositiveSurfaceEvidence(packet: UnifiedFindingPacket) {
  if (
    packet.unifiedFindingId !== "contact_support_path_present" &&
    packet.unifiedFindingId !== "cookie_policy_present"
  ) {
    return false;
  }

  const urls = uniqueStrings([...(packet.evidence?.pageUrls ?? []), ...(packet.evidence?.sourceUrls ?? [])]).filter((url) =>
    hasConcreteHumanFacingUrl([url])
  );
  return hasFindingSpecificSurfaceSnippet(packet.unifiedFindingId, packet.evidence?.snippets) && urls.length >= 2;
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

function getFetchQualityRank(fetchQuality: FetchQuality | null | undefined) {
  switch (fetchQuality) {
    case "verified_content":
      return 4;
    case "thin_content":
      return 3;
    case "blocked_interstitial":
      return 1;
    case "unreachable":
      return 0;
    default:
      return 2;
  }
}

function rankUrlSpecificity(value: string) {
  try {
    const parsed = new URL(value);
    const path = parsed.pathname.replace(/\/+$/, "");
    const segmentCount = path.split("/").filter(Boolean).length;
    return segmentCount * 100 + path.length;
  } catch {
    return value.length;
  }
}

function sortUrlsByTargetStrength(urls: string[], targets: FamilyPacketTargetRecord[]) {
  const qualityByUrl = new Map<string, FetchQuality | null>();
  for (const target of targets) {
    if (typeof target.canonicalUrl !== "string") {
      continue;
    }

    const quality =
      typeof target.fetchQuality === "string" &&
      ["verified_content", "thin_content", "blocked_interstitial", "unreachable"].includes(target.fetchQuality)
        ? (target.fetchQuality as FetchQuality)
        : null;
    qualityByUrl.set(target.canonicalUrl, quality);
  }

  return [...urls].sort((left, right) => {
    const qualityDelta = getFetchQualityRank(qualityByUrl.get(right) ?? null) - getFetchQualityRank(qualityByUrl.get(left) ?? null);
    if (qualityDelta !== 0) {
      return qualityDelta;
    }

    return rankUrlSpecificity(right) - rankUrlSpecificity(left);
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
    fetchQuality: evidence.fetchQuality ?? null,
    flags: [...(evidence.flags ?? [])],
    pageUrls: [...(evidence.pageUrls ?? [])],
    snippets: [...(evidence.snippets ?? [])]
      .filter(isReviewerFacingSnippet)
      .map((snippet) => normalizePolicySnippet(snippet))
      .filter((snippet): snippet is string => Boolean(snippet)),
    sourceUrls: [...(evidence.sourceUrls ?? [])]
  };

  if (POSITIVE_SURFACE_FINDING_IDS.has(findingId)) {
    next.snippets = next.snippets.filter(
      (snippet) => !isBlockedOrInterstitialSnippet(snippet) && !isPolicyPositiveMarkerSnippet(snippet)
    );
  }

  if (findingId === "contact_support_path_present" || findingId === "cookie_policy_present") {
    next.snippets = next.snippets.filter((snippet) => !isLowSignalBrandSnippet(snippet));
  }

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

    if (next.snippets.length === 0) {
      next.snippets = getDerivedSupportAccessEvidenceSnippets({
        findingId,
        pageUrls: next.pageUrls,
        sourceUrls: next.sourceUrls
      });
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
    const preferredPageUrls = stripGenericGuessedCookieProbeUrls(
      next.pageUrls.filter((url) => !isWeakRootLikeUrl(url) && !isMachineReadablePolicyEndpoint(url)),
      next.flags
    );
    if (preferredPageUrls.length > 0) {
      next.pageUrls = preferMoreSpecificSameHostUrls(preferredPageUrls);
    }

    const preferredSourceUrls = stripGenericGuessedCookieProbeUrls(
      next.sourceUrls.filter((url) => !isWeakRootLikeUrl(url) && !isMachineReadablePolicyEndpoint(url)),
      next.flags
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

    if (next.snippets.length === 0) {
      next.snippets = getDerivedSupportAccessEvidenceSnippets({
        findingId,
        pageUrls: next.pageUrls,
        sourceUrls: next.sourceUrls
      });
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

  if (findingId === "accessibility_risk_score") {
    next.flags = next.flags.filter((flag) => flag !== "contradiction_runtime_artifact_retained");
  }

  if (
    (findingId === "contact_support_path_present" || findingId === "cookie_policy_present") &&
    next.fetchQuality === "blocked_interstitial" &&
    hasFindingSpecificSurfaceSnippet(findingId, next.snippets) &&
    uniqueStrings([...next.pageUrls, ...next.sourceUrls]).filter((url) => hasConcreteHumanFacingUrl([url])).length >= 2
  ) {
    next.fetchQuality = "verified_content";
  }

  if (
    findingId === "contact_support_path_present" &&
    next.fetchQuality === "blocked_interstitial" &&
    uniqueStrings([...next.pageUrls, ...next.sourceUrls]).filter((url) => isContactLikeUrl(url)).length >= 2
  ) {
    next.fetchQuality = "thin_content";
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

function augmentAccessibilityAuditEvidence(input: {
  evidence: UnifiedFindingPacket["evidence"] | undefined;
  fallbackEvidence: Record<string, unknown> | null | undefined;
  findingId: string;
}) {
  if (!input.evidence || !ACCESSIBILITY_ISSUE_FINDING_IDS.has(input.findingId)) {
    return input.evidence;
  }

  const coverage = getRepresentativeAccessibilityExampleCoverage(input.fallbackEvidence);
  const flags = new Set(input.evidence.flags ?? []);
  const counts = { ...(input.evidence.counts ?? {}) };
  const score =
    typeof input.fallbackEvidence?.value === "number" && Number.isFinite(input.fallbackEvidence.value)
      ? input.fallbackEvidence.value
      : null;

  if (score !== null) {
    counts.accessibilityRiskScore = score;
  }
  if (coverage.representativeExampleCount === 0) {
    flags.add("accessibility_score_only_audit_context");
  } else if (!hasExternallyPromotableAccessibilityExamples(input.fallbackEvidence)) {
    flags.add("accessibility_examples_below_promotion_threshold");
  }

  return {
    ...input.evidence,
    counts,
    flags: [...flags]
  };
}

function getSourceUrl(packet: UnifiedFindingPacket) {
  return packet.primaryPageUrl ?? packet.evidence?.pageUrls?.[0] ?? packet.evidence?.sourceUrls?.[0];
}

function getSurfaceTitleMismatchUrlPriority(value: string) {
  const lowered = value.toLowerCase();
  if (lowered.includes("/privacy")) {
    return 0;
  }
  if (lowered.includes("/terms") || lowered.includes("/conditions") || lowered.includes("/tos")) {
    return 1;
  }
  if (lowered.includes("/cookie")) {
    return 2;
  }
  if (lowered.includes("/contact") || lowered.includes("/help") || lowered.includes("/support")) {
    return 3;
  }
  return 4;
}

function sortSurfaceTitleMismatchUrls(urls: string[]) {
  return [...urls].sort((left, right) => {
    const priorityDelta = getSurfaceTitleMismatchUrlPriority(left) - getSurfaceTitleMismatchUrlPriority(right);
    if (priorityDelta !== 0) {
      return priorityDelta;
    }

    return left.localeCompare(right);
  });
}

function maybeRepairSurfaceTitleMismatchPacket(packet: UnifiedFindingPacket) {
  if (packet.unifiedFindingId !== "surface_title_mismatch") {
    return packet;
  }

  const existingEvidence = packet.evidence ?? {};
  const preferredPageUrls = sortSurfaceTitleMismatchUrls(uniqueStrings(existingEvidence.pageUrls ?? []));
  const preferredSourceUrls = sortSurfaceTitleMismatchUrls(uniqueStrings(existingEvidence.sourceUrls ?? []));
  const preferredPrimaryUrl = preferredPageUrls[0] ?? preferredSourceUrls[0] ?? packet.primaryPageUrl;
  const affectedUrlCount = uniqueStrings([...preferredPageUrls, ...preferredSourceUrls]).length;
  const summary =
    affectedUrlCount >= 2
      ? "Multiple retained disclosure or support surfaces resolved to page titles that appear inconsistent with their expected surface types."
      : packet.summary;

  return {
    ...packet,
    summary,
    primaryPageUrl: preferredPrimaryUrl,
    evidence: {
      ...existingEvidence,
      pageUrls: preferredPageUrls,
      sourceUrls: preferredSourceUrls
    }
  };
}

function maybeRepairCookiePolicyPacketFromPolicyEnrichment(input: {
  packet: UnifiedFindingPacket;
  policyEnrichment?: Array<Record<string, unknown>>;
}) {
  if (input.packet.unifiedFindingId !== "cookie_policy_present") {
    return input.packet;
  }

  const policyEnrichment = Array.isArray(input.policyEnrichment) ? input.policyEnrichment : [];
  if (policyEnrichment.length === 0) {
    return input.packet;
  }

  const existingEvidence = input.packet.evidence ?? {};
  const existingSnippets = uniqueStrings(existingEvidence.snippets ?? []);
  const existingUrls = uniqueStrings([...(existingEvidence.pageUrls ?? []), ...(existingEvidence.sourceUrls ?? [])]);
  const alreadyStrong =
    hasFindingSpecificSurfaceSnippet("cookie_policy_present", existingSnippets) &&
    existingUrls.some((url) => hasConcreteHumanFacingUrl([url]));

  if (alreadyStrong) {
    return input.packet;
  }

  const fallbackEvidence = buildCookiePolicyFallbackEvidence({
    policyEnrichment,
    signalKey: "disclosure.cookie_policy_present",
    signalLabel: "Cookie settings or policy surface present",
    signalValue: true
  });

  const repairedSnippets = uniqueStrings([
    ...(fallbackEvidence.policySnippets ?? []),
    fallbackEvidence.policySummaryShort,
    ...existingSnippets
  ]).filter((snippet) => isReadableSurfaceSnippet(snippet));
  const repairedPageUrls = preferMoreSpecificSameHostUrls(
    uniqueStrings([fallbackEvidence.pageUrl, ...(fallbackEvidence.pageUrls ?? []), ...(existingEvidence.pageUrls ?? [])]).filter((url) =>
      hasConcreteHumanFacingUrl([url])
    )
  );
  const repairedSourceUrls = preferMoreSpecificSameHostUrls(
    uniqueStrings([...(fallbackEvidence.sourceUrls ?? []), ...(existingEvidence.sourceUrls ?? []), ...repairedPageUrls]).filter((url) =>
      hasConcreteHumanFacingUrl([url])
    )
  );

  if (
    repairedSnippets.length === 0 ||
    (repairedPageUrls.length === 0 && repairedSourceUrls.length === 0)
  ) {
    return input.packet;
  }

  const nextEvidence = sanitizeEvidenceForFinding("cookie_policy_present", {
    ...existingEvidence,
    fetchQuality:
      fallbackEvidence.fetchQuality === "verified_content" ||
      existingEvidence.fetchQuality !== "verified_content"
        ? fallbackEvidence.fetchQuality
        : existingEvidence.fetchQuality,
    flags: uniqueStrings([
      ...(existingEvidence.flags ?? []),
      "family_packet_backed",
      "family_packet:privacy_controls",
      "family_packet_finding:cookie_policy_present"
    ]),
    pageUrls: repairedPageUrls,
    snippets: repairedSnippets,
    sourceUrls: repairedSourceUrls
  });
  return {
    ...input.packet,
    primaryPageUrl: repairedPageUrls[0] ?? repairedSourceUrls[0] ?? input.packet.primaryPageUrl,
    evidence: nextEvidence,
    confidenceInputs: {
      ...input.packet.confidenceInputs,
      hasCorroboratedPositiveSurfaceEvidence:
        input.packet.confidenceInputs.hasCorroboratedPositiveSurfaceEvidence ||
        hasCorroboratedPositiveSurfaceEvidence({
          ...input.packet,
          evidence: nextEvidence
        }),
      hasMultipleHumanFacingUrls:
        input.packet.confidenceInputs.hasMultipleHumanFacingUrls ||
        uniqueStrings([...repairedPageUrls, ...repairedSourceUrls]).length >= 2,
      hasPageAttribution:
        input.packet.confidenceInputs.hasPageAttribution ||
        repairedPageUrls.length > 0 ||
        repairedSourceUrls.length > 0,
      hasPolicyTextEvidence: input.packet.confidenceInputs.hasPolicyTextEvidence || repairedSnippets.length > 0,
      hasReadableSurfaceSnippetEvidence:
        input.packet.confidenceInputs.hasReadableSurfaceSnippetEvidence ||
        hasFindingSpecificSurfaceSnippet("cookie_policy_present", repairedSnippets)
    },
    concernContext: input.packet.concernContext
      ? {
          ...input.packet.concernContext,
          negativeEvidenceFlags: input.packet.concernContext.negativeEvidenceFlags.filter(
            (flag) =>
              flag !== "blocked_or_interstitial_evidence_observed" &&
              flag !== "positive_surface_content_unverified"
          )
        }
      : input.packet.concernContext,
    confidenceBand:
      hasFindingSpecificSurfaceSnippet("cookie_policy_present", repairedSnippets)
        ? "high"
        : input.packet.confidenceBand
  };
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

function truncateToDisplayLength(value: string, maxLength = 240): string {
  if (value.length <= maxLength) {
    return value;
  }
  const slicePoint = value.lastIndexOf(" ", maxLength);
  const endIndex = slicePoint > 0 ? slicePoint : maxLength;
  return `${value.slice(0, endIndex).trimEnd()}...`;
}

function selectObservedValue(packet: UnifiedFindingPacket) {
  const rankedSnippets = rankSnippetsForFinding(packet.unifiedFindingId, packet.evidence?.snippets ?? []);
  const snippet = rankedSnippets[0] ?? null;
  const summary = packet.summary;
  const allUrls = [...(packet.evidence?.pageUrls ?? []), ...(packet.evidence?.sourceUrls ?? [])];

  if (packet.unifiedFindingId === "retargeting_pixel_observed") {
    return "The scan retained a detector-backed retargeting or remarketing signal that merits manual confirmation.";
  }

  if (packet.unifiedFindingId === "video_content_tracking_exposure") {
    const videoTitle = uniqueStrings(
      Object.entries(packet.evidence?.entities ?? {}).flatMap(([key, values]) =>
        /video.*title/i.test(key) ? values : []
      )
    )[0];
    return videoTitle
      ? `Meta/Facebook tracking was observed on a video-content surface ("${truncateToDisplayLength(videoTitle)}").`
      : "Meta/Facebook tracking was observed on a video-content surface.";
  }

  if (packet.unifiedFindingId === "contact_support_path_present") {
    const descriptiveSnippet = (packet.evidence?.snippets ?? []).find(
      (value) =>
        typeof value === "string" &&
        !isLikelyHomepageTitle(value) &&
        !isLowSignalBrandSnippet(value) &&
        /(contact|support|help|feedback|phone|chat|branch|advisor|service)/i.test(value)
    );
    if (descriptiveSnippet) {
      return truncateToDisplayLength(descriptiveSnippet);
    }

    if (allUrls.some((url) => /contact|help|support|feedback/i.test(url))) {
      return packet.confidenceInputs.hasMultipleHumanFacingUrls
        ? "Detected dedicated contact or support surfaces on first-party URLs."
        : "Detected dedicated contact or support surface on a first-party URL.";
    }
  }

  if (packet.unifiedFindingId === "cookie_policy_present") {
    const descriptiveSnippet = rankedSnippets.find(
      (value) =>
        typeof value === "string" &&
        !isLikelyHomepageTitle(value) &&
        !isLowSignalBrandSnippet(value) &&
        /(cookie|tracking|privacy choices|privacy settings|manage cookies|analytical cookies|marketing cookies)/i.test(value)
    );
    if (descriptiveSnippet) {
      return truncateToDisplayLength(descriptiveSnippet);
    }

    if (allUrls.some((url) => /cookie|privacy|legal/i.test(url))) {
      return "Detected first-party cookie-policy or privacy-controls surface.";
    }
  }

  if (packet.unifiedFindingId === "privacy_policy_present") {
    const descriptiveSnippet = rankedSnippets.find((value) => /(privacy policy|privacy notice)/i.test(value));
    if (descriptiveSnippet) {
      const phraseMatch = descriptiveSnippet.match(
        /(privacy policy(?:\s+for\s+[^.|\n]{1,60})?|privacy notice(?:\s+for\s+[^.|\n]{1,60})?)/i
      );
      if (phraseMatch?.[0]) {
        return phraseMatch[0];
      }

      return truncateToDisplayLength(descriptiveSnippet);
    }
  }

  if (packet.unifiedFindingId === "arbitration_clause_present") {
    if (snippet && !looksSynthesizedPolicySummary(snippet) && !isGenericObservationText(snippet)) {
      return truncateToDisplayLength(snippet);
    }

    return "The scan retained terms language that appears to include arbitration or dispute-resolution provisions worth reading directly.";
  }

  if (snippet && !isGenericObservationText(snippet)) {
    return truncateToDisplayLength(snippet);
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

function getHostnameFromUrl(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  try {
    return new URL(value).hostname;
  } catch {
    return null;
  }
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
    ...(input.packet.evidence?.fetchQuality ? [`fetch_quality:${input.packet.evidence.fetchQuality}`] : []),
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
    input.fallbackEvidenceRows.some((row) => Boolean(row?.gpcVerification) && typeof row?.gpcVerification === "object") ||
    input.fallbackEvidenceRows.some((row) => hasConcretePreconsentArtifact(row)) ||
    input.fallbackEvidenceRows.some((row) => (getContradictionEvidenceBundle(row)?.runtimeEvidenceArtifacts.length ?? 0) > 0) ||
    input.fallbackEvidenceRows.some((row) => hasConcreteSanitizedNetworkEvidence(row)) ||
    validationEvidenceRows.some((row) =>
      Object.keys(row).some((key) => /runtime|request|network|tracker/i.test(key))
    );

  const hasPolicyTextEvidence = normalizedConcernStrengthFlags.includes("policy_text") || allEvidenceRows.some((row) => {
    const normalizedRow = normalizeUnifiedFindingEvidenceRecord(row);
    const contradictionEvidence = getContradictionEvidenceBundle(normalizedRow);
    return (
      Boolean(contradictionEvidence?.policySnippet) ||
      Boolean(contradictionEvidence?.claim) ||
      isMeaningfulPolicyText(normalizedRow.policySnippet) ||
      (Array.isArray(normalizedRow.policySnippets) &&
        normalizedRow.policySnippets.some((entry) => typeof entry === "string" && isMeaningfulPolicyText(entry))) ||
      isMeaningfulPolicyText(normalizedRow.policySummaryShort) ||
      isMeaningfulPolicyText(normalizedRow.description) ||
      isMeaningfulPolicyText(normalizedRow.disclosureSummary) ||
      typeof normalizedRow.pageUrl === "string"
    );
  });

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
    (input.packet.evidence?.pageUrls?.length ?? 0) > 0 ||
    (input.packet.evidence?.sourceUrls?.length ?? 0) > 0;
  const humanFacingUrls = uniqueStrings([
    ...(input.packet.evidence?.pageUrls ?? []),
    ...(input.packet.evidence?.sourceUrls ?? [])
  ]).filter((url) => hasConcreteHumanFacingUrl([url]));
  const hasPacketBackedEvidence = hasFamilyPacketFlag(input.packet.evidence?.flags);
  const hasMultipleHumanFacingUrls = humanFacingUrls.length >= 2;
  const hasReadableSurfaceSnippetEvidence = hasFindingSpecificSurfaceSnippet(
    input.packet.unifiedFindingId,
    input.packet.evidence?.snippets
  );
  const hasCorroboratedPositiveSurfaceEvidence =
    (input.packet.unifiedFindingId === "contact_support_path_present" ||
      input.packet.unifiedFindingId === "cookie_policy_present") &&
    hasReadableSurfaceSnippetEvidence &&
    hasMultipleHumanFacingUrls;

  return {
    evidenceQualityFlags,
    hasConcretePayloadEvidence: concretePayloadEvidence,
    hasCorroboratedPositiveSurfaceEvidence,
    hasDirectRuntimeEvidence,
    hasKeyPageDiscoveryEvidence,
    hasReadableSurfaceSnippetEvidence,
    hasMultipleHumanFacingUrls,
    hasPageAttribution,
    hasPacketBackedEvidence,
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
    score += 3;
  }
  if (inputs.hasPacketBackedEvidence) {
    score += 1;
  }
  if (inputs.hasMultipleHumanFacingUrls) {
    score += 1;
  }
  if (inputs.hasReadableSurfaceSnippetEvidence) {
    score += 1;
  }
  if (inputs.hasCorroboratedPositiveSurfaceEvidence) {
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
    | "cookie_policy_present"
    | "privacy_rights_path_present"
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
          (sourceRef.source === "policy_enrichment_signal" || sourceRef.source === "document_semantic_signal") &&
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
          (sourceRef.source === "policy_enrichment_signal" || sourceRef.source === "document_semantic_signal") &&
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
          (sourceRef.source === "policy_enrichment_signal" || sourceRef.source === "document_semantic_signal") &&
          getPolicyPositiveSignalKeysForFinding("third_party_advertising_disclosure_present").includes(sourceRef.key)
      )
  }
];

const POLICY_ENRICHMENT_FINDING_SUPPORT_RULES: PolicyEnrichmentFindingSupportRule[] = [
  {
    findingId: "cookie_policy_present",
    rationale: "Surfaced because structured policy evidence retained a reachable cookie-policy or cookie-settings surface."
  },
  {
    findingId: "privacy_rights_path_present",
    rationale: "Surfaced because structured policy evidence retained a concrete privacy-rights path."
  },
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

const POLICY_ENRICHMENT_POSITIVE_SNIPPET_SELECTORS: Record<string, Array<string | RegExp>> = {
  cookie_policy_present: [
    "cookie_table",
    "cookie_notice",
    "cookies",
    "tracking_technologies",
    "targeted_advertising",
    "privacy_choices",
    "do_not_sell",
    /^topic:cookie/i,
    /cookie/i,
    /tracking/i,
    /privacy_choices/i
  ],
  privacy_contact_path_present: ["privacy_contact", "notice_contact", "dsar", /privacy.*contact/i],
  privacy_rights_path_present: [
    "dsar",
    "access",
    "delete",
    "correct",
    "export",
    "manage",
    "state_rights",
    "authorized_agent",
    "appeal",
    "privacy_controls",
    "privacy_contact",
    /^rights[_:-]/i,
    /^rights_signal[:_-]/i,
    /^topic:privacy_rights/i,
    /^topic:dsar/i
  ],
  gpc_disclosure_present: ["topic:gpc_disclosure", "gpc_disclosure", /global_privacy_control|gpc/i],
  tracking_technologies_disclosure_present: [
    "topic:tracking_technologies_disclosure",
    "tracking_technologies_disclosure",
    /tracking|cookie|pixel|beacon|tag/i
  ],
  targeted_advertising_disclosure_present: [
    "topic:targeted_advertising_disclosure",
    "targeted_advertising_disclosure",
    /targeted|sale|sharing|advertising/i
  ],
  behavioral_analytics_disclosure_present: [
    "topic:session_replay_disclosure",
    "topic:tracking_technologies_disclosure",
    "session_replay_disclosure",
    "behavioral_analytics_disclosure",
    "product_analytics_disclosure",
    /session_replay|behavioral_analytics|product_analytics|tracking_technologies/i
  ],
  children_privacy_disclosure_present: ["topic:children", "children", /children|child|minor|under_13/i],
  arbitration_clause_present: ["arbitration", /arbitration|dispute/i]
};

function policyEnrichmentSnippetRank(findingId: string, value: string) {
  if (findingId !== "cookie_policy_present") {
    if (findingId === "behavioral_analytics_disclosure_present") {
      if (/session replay|session recording|mouse movements?|clicks?|keystrokes?|pages visited|observe (?:how )?(?:visitors|users)/i.test(value)) {
        return 0;
      }
      if (/google analytics.{0,160}(?:behavioral data|track (?:your )?use|understand how (?:visitors?|users?) use)|analytics tools?.{0,120}(?:understand|measure|analy[sz]e).{0,120}(?:visitors?|users?|use of (?:our )?(?:services?|site|website))/i.test(value)) {
        return 1;
      }
      if (/behavioral analytics|behavioural analytics|product analytics|hotjar|fullstory|mouseflow|contentsquare|microsoft clarity/i.test(value)) {
        return 2;
      }
      return 4;
    }
    return 0;
  }
  if (/cookie policy|cookie notice|cookie statement|cookie settings|cookie consent center|manage cookies|cookie preferences/i.test(value)) {
    return 0;
  }
  if (/cookies? and similar technolog(?:y|ies)|tracking technolog(?:y|ies)|advertising cookies|analytics cookies/i.test(value)) {
    return 1;
  }
  if (/privacy choices|your privacy choices|gpc|global privacy control|opt-out preference/i.test(value)) {
    return 2;
  }
  if (/cookie/i.test(value) && value.length >= 80) {
    return 3;
  }
  return 4;
}

function sortPolicyEnrichmentSnippetValues(findingId: string, snippets: string[]) {
  return [...snippets].sort((left, right) => {
    const rankDelta = policyEnrichmentSnippetRank(findingId, left) - policyEnrichmentSnippetRank(findingId, right);
    return rankDelta !== 0 ? rankDelta : right.length - left.length;
  });
}

function getPolicyBoilerplateSignalsFromSnippets(snippets: string[]) {
  return uniqueStrings(
    snippets.flatMap((value) => {
      const hits: string[] = [];
      if (/advertising partners privacy policies?/i.test(value)) {
        hits.push("generic_ad_partner_disclosure");
      }
      if (/cookies and web beacons/i.test(value)) {
        hits.push("generic_cookie_web_beacons");
      }
      if (/log files/i.test(value)) {
        hits.push("generic_log_files");
      }
      if (/hyperlinking to our content/i.test(value)) {
        hits.push("generic_hyperlinking_clause");
      }
      if (/\biframes?\b/i.test(value)) {
        hits.push("generic_iframe_clause");
      }
      if (/comments?/i.test(value) && /post|publish|user/i.test(value)) {
        hits.push("generic_user_comment_clause");
      }
      if (/ccpa privacy rights/i.test(value)) {
        hits.push("ccpa_rights_template");
      }
      if (/gdpr/i.test(value)) {
        hits.push("gdpr_template");
      }
      return hits;
    })
  );
}

function hasConcretePrivacyContactSnippet(snippets: string[]) {
  return snippets.some((value) =>
    /(?:privacy|dpo|data[-_\s]?protection)[\w.+-]*@[a-z0-9.-]+\.[a-z]{2,}|data protection officer|\bdpo\b|privacy (?:team|office|department)|(?:privacy|personal information|personal data|data protection).{0,80}(?:request form|webform|portal|request portal|contact form)|(?:request form|webform|portal|request portal|contact form).{0,80}(?:privacy|personal information|personal data|data protection)|contact us.{0,160}(?:privacy practices?|privacy questions?|personal information|rights? request)|(?:privacy practices?|privacy questions?|personal information|rights? request).{0,160}contact us/i.test(
      value
    )
  );
}

function hasSubstantivePrivacyPolicyContent(snippets: string[]) {
  const text = snippets.join(" ");
  return (
    /personal information|personal data|covered personal information|data subjects?|privacy rights?|right to (?:know|access|delete|correct)|data protection/i.test(text) &&
    /collect|use|share|disclos|retain|protect|process|access|delete|correct|opt[-\s]?out|sell|transfer|request/i.test(text)
  );
}

function buildPolicyEnrichmentPositiveCandidates(policyEnrichment?: Array<Record<string, unknown>>) {
  const rows = Array.isArray(policyEnrichment) ? policyEnrichment : [];
  if (rows.length === 0) {
    return [] as UnifiedFindingCandidate[];
  }

  const candidates: UnifiedFindingCandidate[] = [];
  for (const rule of POLICY_ENRICHMENT_FINDING_SUPPORT_RULES) {
    const signalKey =
      rule.findingId === "cookie_policy_present"
        ? "disclosure.cookie_policy_present"
        : getPolicyPositiveSignalKeysForFinding(rule.findingId)[0];
    const mappedFinding = getReportUnifiedFinding(rule.findingId as ReportUnifiedFindingId);
    if (!signalKey || !mappedFinding) {
      continue;
    }

    const expectedPageType =
      rule.findingId === "arbitration_clause_present"
        ? "terms_of_service"
        : rule.findingId === "cookie_policy_present"
          ? "cookie_policy"
          : "privacy_policy";
    const selectors = POLICY_ENRICHMENT_POSITIVE_SNIPPET_SELECTORS[rule.findingId] ?? [];
    const row = rows.find((entry) => getPolicyPageType(entry) === expectedPageType && getPolicyEvidenceSnippetValues(entry, selectors).length > 0);
    if (!row) {
      continue;
    }

    const pageUrl = getPolicyPageUrl(row);
    const snippets = normalizePolicySnippetList(
      sortPolicyEnrichmentSnippetValues(rule.findingId, getPolicyEvidenceSnippetValues(row, selectors)).slice(0, 4)
    );
    if (!pageUrl || snippets.length === 0) {
      continue;
    }

    const evidenceRefs = uniqueStrings([pageUrl]);
    candidates.push({
      description: rule.rationale,
      fallbackEvidence: {
        evidenceRefs,
        pageUrl,
        pageUrls: evidenceRefs,
        policyDsarMechanism: getPolicyDsarMechanism(row),
        policyPageType: getPolicyPageType(row),
        policyPositiveSnippetKeys: selectors.filter((selector): selector is string => typeof selector === "string").slice(0, 8),
        policyPositiveTopic: signalKey.replace(/^privacy\./, "").replace(/_present$/, ""),
        policyRightsSignals: getPolicyRightsSignals(row),
        policySnippets: snippets,
        policySummaryShort: snippets.length > 0 ? null : getPolicySummaryText(row),
        privacyContactChannelType: getPrivacyContactChannelType(row),
        signalKey,
        signalLabel: mappedFinding.label,
        signalValue: true,
        sourceUrls: evidenceRefs,
        unifiedFindingId: rule.findingId
      },
      observedValue: mappedFinding.label,
      severity: "low",
      signalKey,
      signalLabel: mappedFinding.label,
      signalSource: "policy_enrichment_signal",
      sourceType: "signal",
      title: mappedFinding.label
    });
  }

  return candidates;
}

function buildPolicyEnrichmentMissingContactCandidates(policyEnrichment?: Array<Record<string, unknown>>) {
  const rows = Array.isArray(policyEnrichment) ? policyEnrichment : [];
  const candidates: UnifiedFindingCandidate[] = [];
  const mappedFinding = getReportUnifiedFinding("privacy_contact_channel_missing");
  if (!mappedFinding) {
    return candidates;
  }

  for (const row of rows) {
    if (getPolicyPageType(row) !== "privacy_policy" || getPrivacyContactChannelType(row) !== "none") {
      continue;
    }
    const pageUrl = getPolicyPageUrl(row);
    if (!pageUrl) {
      continue;
    }
    const snippets = normalizePolicySnippetList(getPolicyEvidenceSnippetValues(row, [/.*/]).slice(0, 6));
    const policySemanticConfidence = getPolicySemanticConfidence(row);
    if (
      snippets.length === 0 ||
      !hasSubstantivePrivacyPolicyContent(snippets) ||
      hasConcretePrivacyContactSnippet(snippets) ||
      typeof policySemanticConfidence !== "number" ||
      policySemanticConfidence < 0.7
    ) {
      continue;
    }

    candidates.push({
      description:
        "The retained privacy-policy evidence did not identify a privacy-specific contact email, form, portal, or equivalent request channel.",
      fallbackEvidence: {
        evidenceRefs: [pageUrl],
        mergedSignalConfidence: policySemanticConfidence,
        pageUrl,
        pageUrls: [pageUrl],
        policyPageType: getPolicyPageType(row),
        policySemanticConfidence,
        policySnippetCount: getPolicySnippetCount(row),
        policySnippets: snippets,
        privacyContactChannelType: "none",
        signalKey: "privacy.privacy_contact_channel_missing",
        signalLabel: mappedFinding.label,
        signalValue: true,
        sourceUrls: [pageUrl],
        unifiedFindingId: "privacy_contact_channel_missing"
      },
      observedValue: "No privacy-specific contact channel",
      severity: "medium",
      signalKey: "privacy.privacy_contact_channel_missing",
      signalLabel: mappedFinding.label,
      signalSource: "policy_enrichment_signal",
      sourceType: "signal",
      title: mappedFinding.label
    });
  }

  return candidates;
}

function buildPolicyEnrichmentClarityCandidates(policyEnrichment?: Array<Record<string, unknown>>) {
  const rows = Array.isArray(policyEnrichment) ? policyEnrichment : [];
  const candidates: UnifiedFindingCandidate[] = [];
  const mappedFinding = getReportUnifiedFinding("policy_clarity_risk");
  if (!mappedFinding) {
    return candidates;
  }

  for (const row of rows) {
    if (getPolicyPageType(row) !== "privacy_policy") {
      continue;
    }
    const pageUrl = getPolicyPageUrl(row);
    if (!pageUrl) {
      continue;
    }
    const snippets = normalizePolicySnippetList(getPolicyEvidenceSnippetValues(row, [/.*/]).slice(0, 6));
    const boilerplateSignals = getPolicyBoilerplateSignalsFromSnippets(snippets);
    const ambiguityScore = getPolicyAmbiguityScore(row);
    const semanticConfidence = getPolicySemanticConfidence(row);
    const hasScoreBackedRisk =
      typeof ambiguityScore === "number" &&
      ambiguityScore >= 70 &&
      typeof semanticConfidence === "number" &&
      semanticConfidence >= 0.5;
    const hasBoilerplateRisk = boilerplateSignals.length >= 2 && snippets.length > 0;
    if (!hasScoreBackedRisk && !hasBoilerplateRisk) {
      continue;
    }

    candidates.push({
      description:
        hasBoilerplateRisk
          ? "The retained privacy-policy text includes multiple boilerplate markers that may not be tailored to the observed site implementation."
          : "The retained privacy-policy text includes a calibrated ambiguity score and substantive policy snippets.",
      fallbackEvidence: {
        evidenceRefs: [pageUrl],
        mergedSignalConfidence: semanticConfidence,
        pageUrl,
        pageUrls: [pageUrl],
        policyBoilerplateSignals: boilerplateSignals,
        policyPageType: getPolicyPageType(row),
        policySnippetCount: getPolicySnippetCount(row),
        policySnippets: snippets,
        signalKey: "policyAmbiguityScore",
        signalLabel: mappedFinding.label,
        signalValue: ambiguityScore,
        sourceUrls: [pageUrl],
        unifiedFindingId: "policy_clarity_risk"
      },
      observedValue: typeof ambiguityScore === "number" ? String(ambiguityScore) : mappedFinding.label,
      severity: "medium",
      signalKey: "policyAmbiguityScore",
      signalLabel: mappedFinding.label,
      signalSource: "policy_enrichment_signal",
      sourceType: "signal",
      title: mappedFinding.label
    });
  }

  return candidates;
}

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
  if (packet.confidenceInputs.hasPacketBackedEvidence) {
    positives.push("packet-backed first-party surface evidence was retained");
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
  if (packet.confidenceInputs.hasMultipleHumanFacingUrls) {
    positives.push("multiple human-facing URLs corroborated the surface");
  }
  if (packet.confidenceInputs.hasReadableSurfaceSnippetEvidence) {
    positives.push("readable first-party surface text was retained");
  }
  if (packet.confidenceInputs.hasCorroboratedPositiveSurfaceEvidence) {
    positives.push("corroborating first-party surface evidence lined up across URLs and snippets");
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
  reject_did_not_reduce_third_party_cookies: {
    suggestedFix: "Review third-party cookie controls so reject meaningfully reduces non-essential cookie activity after the interaction completes.",
    whyThisMatters: "Persistent third-party cookies after reject can signal that consent controls are not enforcing the promised outcome."
  },
  gpc_signal_not_honored: {
    suggestedFix: "Honor browser-level opt-out preference signals by suppressing the non-essential tracking or cookie activity that still fired under GPC.",
    whyThisMatters: "If the site ignores a browser-level privacy preference signal, users may not get the choice outcome they expected."
  },
  rtb_cookie_sync_observed: {
    suggestedFix: "Inventory the advertising exchange, identity-sync, and cookie-sync endpoints that load during initial render, then gate non-essential programmatic adtech behind the consent state.",
    whyThisMatters: "A broad RTB or identity-sync footprint can transmit identifiers across multiple third parties before users have a meaningful chance to choose."
  },
  weak_cookie_security_attributes: {
    suggestedFix: "Review the observed cookie set and tighten weak attributes such as missing Secure or HttpOnly flags and weak SameSite settings where appropriate.",
    whyThisMatters: "Weak cookie attributes can make it easier for cookies to be handled in less protective ways than expected."
  },
  session_replay_undisclosed: {
    suggestedFix: "Review replay tooling deployment and either disclose it clearly in privacy/cookie materials or disable it until disclosures are accurate.",
    whyThisMatters: "Undisclosed session replay can materially change how users understand monitoring on the site."
  },
  session_replay_on_sensitive_input_surface: {
    suggestedFix: "Remove replay tooling from sensitive-input flows or add tighter field masking and monitoring controls before allowing replay to run there.",
    whyThisMatters: "Replay tooling on sensitive-input surfaces can increase exposure if typed or submitted data is captured more broadly than users expect."
  },
  sensitive_data_collection_with_third_party_tracking_present: {
    suggestedFix: "Review the page or form where sensitive data is collected and suppress third-party advertising, replay, or analytics tooling unless it is clearly necessary and tightly controlled.",
    whyThisMatters: "Collecting sensitive data on pages that also load third-party tracking can materially increase privacy and data-handling risk."
  },
  data_categories_disclosure_missing: {
    suggestedFix: "Add a clear explanation of the main categories of personal or sensitive data the site collects, especially on the primary privacy notice.",
    whyThisMatters: "Without a concrete description of what categories of data are collected, users cannot easily understand the real scope of the site's data practices."
  },
  third_party_recipient_disclosure_missing: {
    suggestedFix: "Add clearer disclosure about the main outside service providers, vendors, or recipient categories involved in handling user data.",
    whyThisMatters: "Users and reviewers need a practical picture of which outside parties may receive or process site data."
  },
  purpose_of_use_disclosure_missing: {
    suggestedFix: "Clarify the main purposes for which the site uses collected data so the notice explains more than just collection itself.",
    whyThisMatters: "A notice that describes collection without explaining use leaves users with an incomplete understanding of the site's data practices."
  },
  keyboard_only_task_completion_blocked: {
    suggestedFix:
      "Review the affected flow using keyboard-only navigation and fix focus order, trapping, and interaction logic that may be impeding task completion.",
    whyThisMatters:
      "A concentration of keyboard-navigation issues can indicate that some users may have trouble completing key site workflows without a mouse."
  },
  critical_form_completion_barrier: {
    suggestedFix:
      "Review the affected form flow and improve field labels, structure, and assistive-technology support where the retained evidence suggests completion may be at risk.",
    whyThisMatters:
      "A concentration of serious form-label or structure issues can indicate that sign-up, checkout, or support tasks may be difficult to complete reliably."
  },
  cancellation_method_disclosure_missing: {
    suggestedFix: "Add a clear, user-facing explanation of how cancellation or account closure actually works, including the path, method, or request channel people must use.",
    whyThisMatters: "If a service discusses cancellation or exit rights without clearly explaining how to cancel, users may struggle to leave the service in practice."
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
  video_content_tracking_exposure: {
    suggestedFix: "Review the retained video page and Meta/Facebook request evidence, then gate advertising pixels on video-content surfaces behind appropriate consent and avoid sending video titles or page context unless it is necessary and disclosed.",
    whyThisMatters: "Video page activity combined with advertising pixels can create VPPA-style privacy exposure when viewing context is linked to a user or advertising identifier."
  },
  fingerprinting_observed: {
    suggestedFix: "Review the scripts collecting multiple device or browser attributes and gate that activity until it is clearly necessary, disclosed, and consent-aligned.",
    whyThisMatters: "Multi-signal browser fingerprinting can make a site more privacy-invasive by identifying browsers or devices without relying only on cookies."
  },
  popup_behavior_observed: {
    suggestedFix: "Reduce or defer popup behavior so users can reach core content without immediate interruption or repeated takeover prompts.",
    whyThisMatters: "Frequent or early popup behavior can make the site feel intrusive and can interfere with user choice or content access."
  },
  blocking_overlay_observed: {
    suggestedFix: "Remove or soften blocking overlays unless they are strictly necessary, and make sure users can still reach content or dismiss the takeover clearly.",
    whyThisMatters: "Blocking overlays can obstruct content and limit meaningful interaction when they appear before users can engage with the page normally."
  },
  autoplay_media_observed: {
    suggestedFix: "Disable autoplay by default or ensure media starts only after a clear user action, especially on landing pages and consent-sensitive flows.",
    whyThisMatters: "Autoplaying audio or video can create intrusive page behavior and may undermine user expectations around control and accessibility."
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
  affiliate_disclosure_scope_limited: {
    suggestedFix:
      "Retain clearer page-attributed evidence that the affiliate disclosure appears near the relevant recommendation, endorsement, or outbound purchase context, not only on a dedicated legal page.",
    whyThisMatters:
      "A dedicated affiliate disclosure page is helpful, but reviewers also need evidence that the disclosure is exposed where monetized recommendations or purchase paths actually appear."
  },
  surface_title_mismatch: {
    suggestedFix:
      "Review the retained page title and route pairing so legal, privacy, cookie, contact, or similar surfaces use titles that match the live page purpose.",
    whyThisMatters:
      "If a retained disclosure or support surface resolves to a mismatched title, users and reviewers may be routed to the wrong page or left unsure whether the intended disclosure was actually fetched."
  },
  legal_entity_name_present: {
    suggestedFix: "Keep the operating legal entity easy to identify on public-facing legal, about, or contact surfaces and make sure the retained text matches the live operator identity.",
    whyThisMatters: "A visible legal entity name helps users and reviewers understand who operates the site and who is accountable for the offer."
  },
  guaranteed_or_high_return_claims_present: {
    suggestedFix: "Review return language anywhere the site promotes an investment and remove or qualify claims that imply guaranteed, unusually high, or low-risk returns without strong substantiation and nearby risk context.",
    whyThisMatters: "Guaranteed or unusually high return claims are a core financial-promotion risk signal because they can overstate likely outcomes and understate investor risk."
  },
  guaranteed_outcome_claim_detected: {
    suggestedFix:
      "Remove or tightly qualify any language that frames financial outcomes as guaranteed, assured, protected from loss, or otherwise effectively certain.",
    whyThisMatters:
      "Guaranteed-outcome framing can materially distort how users judge risk because it implies certainty where real financial offers usually carry variability and downside."
  },
  earnings_claim_without_adjacent_disclosure: {
    suggestedFix:
      "Keep earnings or performance-style claims close to concrete balancing context, including risk, variability, eligibility, and any material assumptions needed to interpret the promoted outcome.",
    whyThisMatters:
      "When earnings-style claims appear without nearby balancing context, users may overread the promoted outcome as typical, easy, or likely."
  },
  simulated_performance_without_disclosure: {
    suggestedFix:
      "Qualify simulated, hypothetical, or backtested performance language where it appears and keep clear disclosure nearby that the results are not live realized outcomes.",
    whyThisMatters:
      "Simulated or backtested performance can overstate likely outcomes if users are not shown clear nearby context about methodology and real-world limits."
  },
  unsubstantiated_testimonial_near_performance_claim: {
    suggestedFix:
      "Keep testimonials, reviews, and endorsement-style social proof away from performance claims unless the page also includes clear nearby substantiation, typicality, compensation, and risk disclosures.",
    whyThisMatters:
      "Pairing social proof with guaranteed or performance-style claims can amplify deception risk under endorsement and investment-advertising review standards."
  },
  unqualified_superlative_claim_detected: {
    suggestedFix:
      "Review broad superiority language such as best, highest, leading, or number one and either substantiate it clearly or narrow the wording to what the page can actually support.",
    whyThisMatters:
      "Unqualified superlatives can inflate perceived credibility or expected performance when they are not tied to a clear comparison basis."
  },
  financial_urgency_pressure_tactic_detected: {
    suggestedFix:
      "Reduce deadline, scarcity, or act-now language around financial promotions unless the page also gives users enough room to review risks, terms, and limitations.",
    whyThisMatters:
      "Urgency tactics can push users toward faster decisions on higher-risk financial offers before they absorb material disclosures."
  },
  pricing_or_fee_transparency_unclear: {
    suggestedFix:
      "Retain clearer nearby fee terms, pricing conditions, and cost qualifiers wherever a financial or quasi-financial offer promotes affordability, plans, or account pricing.",
    whyThisMatters:
      "Opaque pricing or fee framing makes it harder for users and reviewers to understand the real cost of the promoted offer."
  },
  operator_contact_path_present: {
    suggestedFix: "Keep the operator contact path easy to find and make sure the listed email, form, phone, or support route remains current.",
    whyThisMatters: "A visible operator contact path helps users and reviewers understand how to reach the business behind the offer."
  },
  regulatory_registration_disclosure_absent: {
    suggestedFix:
      "If the site provides investment advice, trading signals, or managed-fund style services, disclose the relevant registration status, registration number, or a clear non-registered informational-use statement.",
    whyThisMatters:
      "Trading-signal, forex, futures, prop-trading, and advisory surfaces create elevated review risk when users cannot tell whether the operator is registered with NFA, CFTC, SEC, FCA, or an equivalent regulator."
  },
  investment_risk_disclosure_present: {
    suggestedFix: "Keep investment-risk disclosures easy to find anywhere yield, return, or high-risk product claims appear, and make sure the language matches the live offer.",
    whyThisMatters: "A visible investment-risk disclosure helps users and reviewers understand when returns or financial-product claims are accompanied by meaningful cautionary context."
  },
  investment_purchase_by_credit_card_present: {
    suggestedFix: "Review whether the offer encourages users to fund an investment or speculative product by credit card, and add clearer risk framing or product guardrails where needed.",
    whyThisMatters: "Credit-card funding can intensify consumer harm in speculative or investment contexts because it lowers friction while layering borrowing risk on top of the promoted offer."
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
  investment_urgency_countdown_present: {
    suggestedFix: "Review countdowns, scarcity language, and deadline-driven investment prompts so users are not pressured into acting before they can assess risks and disclosures.",
    whyThisMatters: "Urgency tactics can distort decision-making in investment contexts, especially when paired with return claims or credibility cues."
  },
  pump_and_dump_language_present: {
    suggestedFix: "Investigate whether the site is using insider-style timing language, coordinated hype claims, or other market-manipulation cues, and remove them from the offer surface.",
    whyThisMatters: "Pump-and-dump style language is a strong financial-promotion red flag because it frames value around artificial hype or coordinated price movement rather than legitimate product information."
  },
  vague_whitepaper_or_technical_obfuscation_present: {
    suggestedFix: "Review the white paper, technical explanation, or token mechanics language and replace vague jargon with concrete, user-facing explanations of what the product is and how it works.",
    whyThisMatters: "Jargon-heavy offering materials can make a speculative product seem more credible while leaving users without a clear explanation of the underlying offer."
  },
  regulator_operated_mock_investment_example: {
    suggestedFix: "Treat this as important scan context and distinguish the site’s educational or mock-offer role from the deceptive financial-promotion signals it is intentionally demonstrating.",
    whyThisMatters: "If a site is a regulator-operated mock investment example, readers need that context so they do not mistake the report for a standard trust review of a live issuer."
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

function isCoverageThin(summary?: UnifiedFindingCoverageSummary) {
  if (!summary) {
    return false;
  }

  const pagesScanned = typeof summary.pagesScanned === "number" ? summary.pagesScanned : null;
  const policyEnrichmentCount = typeof summary.policyEnrichmentCount === "number" ? summary.policyEnrichmentCount : null;
  const verifiedPublicSurfacesCount =
    typeof summary.verifiedPublicSurfacesCount === "number" ? summary.verifiedPublicSurfacesCount : null;
  const legalCoverageScore = typeof summary.legalCoverageScore === "number" ? summary.legalCoverageScore : null;

  return (
    pagesScanned !== null &&
    pagesScanned <= 1 &&
    (policyEnrichmentCount === null || policyEnrichmentCount === 0) &&
    (verifiedPublicSurfacesCount === null || verifiedPublicSurfacesCount === 0) &&
    (legalCoverageScore === null || legalCoverageScore <= 0)
  );
}

function isCoverageSensitiveAbsencePacket(packet: UnifiedFindingPacket) {
  if (
    packet.confidenceInputs.hasDirectRuntimeEvidence ||
    packet.confidenceInputs.hasConcretePayloadEvidence ||
    packet.confidenceInputs.hasStructuredValidationEvidence
  ) {
    return false;
  }

  if (packet.details?.family === "coverage_gap") {
    return true;
  }

  if (/(missing|absent|unresolved|fetch_failed)/i.test(packet.unifiedFindingId)) {
    return true;
  }

  return packet.sourceRefs.some((sourceRef) => {
    if (sourceRef.kind !== "signal") {
      return false;
    }

    return /(missing|absent|unresolved|fetch_failed)/i.test(sourceRef.key);
  });
}

function applyCoverageCalibrationToPresentationDecision(
  packet: UnifiedFindingPacket,
  decision: UnifiedFindingPresentationDecision,
  coverageSummary?: UnifiedFindingCoverageSummary
) {
  if (decision.status !== "surface" || !isCoverageThin(coverageSummary) || !isCoverageSensitiveAbsencePacket(packet)) {
    return decision;
  }

  return {
    ...decision,
    confidenceRationale: `${decision.confidenceRationale} Thin scan coverage reduced confidence in this absence-style finding.`,
    downgradeReasons: uniqueStrings([
      ...decision.downgradeReasons,
      "Thin scan coverage means this absence-style finding was not verified across enough public surfaces."
    ]),
    rationale:
      "Thin scan coverage retained this absence-style finding for audit review, but not for main-narrative surfacing.",
    status: "audit_only" as const
  };
}

function hasContradictionSuppressingPositiveSurface(packet: UnifiedFindingPacket) {
  return (
    packet.confidenceInputs.hasPageAttribution &&
    (
      packet.confidenceInputs.hasCorroboratedPositiveSurfaceEvidence ||
      packet.confidenceInputs.hasReadableSurfaceSnippetEvidence ||
      packet.confidenceInputs.hasPolicyTextEvidence ||
      packet.confidenceInputs.hasPacketBackedEvidence
    )
  );
}

function suppressContradictoryMissingSurfacePackets(packets: UnifiedFindingPacket[]) {
  const suppressingPositiveIds = new Set(
    packets
      .filter(
        (packet) =>
          [...CONTRADICTORY_SURFACE_FINDING_PAIRS.values()].includes(packet.unifiedFindingId) &&
          hasContradictionSuppressingPositiveSurface(packet)
      )
      .map((packet) => packet.unifiedFindingId)
  );

  if (suppressingPositiveIds.size === 0) {
    return packets;
  }

  return packets.filter((packet) => {
    const suppressingPositiveId = CONTRADICTORY_SURFACE_FINDING_PAIRS.get(packet.unifiedFindingId);
    return !suppressingPositiveId || !suppressingPositiveIds.has(suppressingPositiveId);
  });
}

function buildLegacyPresentationDecisionFromSurfacing(input: {
  coverageSummary?: UnifiedFindingCoverageSummary;
  packet: UnifiedFindingPacket;
  surfacingDecision: UnifiedFindingSurfacingDecision;
}): UnifiedFindingPresentationDecision {
  return applyCoverageCalibrationToPresentationDecision(
    input.packet,
    finalizePresentationDecision(input.packet, {
      confidenceRationale: buildConfidenceRationale(input.packet),
      rationale:
        input.surfacingDecision.decisionReasons[0] ??
        "Surfacing policy retained this finding for report review.",
      status: mapSurfacingDecisionToLegacyStatus(input.surfacingDecision)
    }),
    input.coverageSummary
  );
}

function getSourceLabel(packet: UnifiedFindingPacket) {
  const sourceUrl = getSourceUrl(packet);
  if (!sourceUrl) {
    return undefined;
  }

  if (
    packet.unifiedFindingId === "surface_title_mismatch" &&
    uniqueStrings([...(packet.evidence?.pageUrls ?? []), ...(packet.evidence?.sourceUrls ?? [])]).length >= 2
  ) {
    return "Multiple surfaces";
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

function getUnifiedFindingBaseSortPriority(unifiedFindingId: string) {
  if (DECEPTIVE_FINANCIAL_PROMOTION_FINDING_IDS.has(unifiedFindingId)) {
    return 500;
  }
  if (CONTEXT_FINDING_IDS.has(unifiedFindingId)) {
    return 450;
  }
  if (FINANCIAL_PROMOTION_FINDING_IDS.has(unifiedFindingId)) {
    return 350;
  }
  if (COVERAGE_FINDING_IDS.has(unifiedFindingId) || unifiedFindingId === "accessibility_risk_score") {
    return 100;
  }
  return 250;
}

function compareUnifiedFindingPackets(left: UnifiedFindingPacket, right: UnifiedFindingPacket) {
  const priorityDelta =
    getUnifiedFindingBaseSortPriority(right.unifiedFindingId) - getUnifiedFindingBaseSortPriority(left.unifiedFindingId);
  if (priorityDelta !== 0) {
    return priorityDelta;
  }

  const severityDelta = getSeverityWeight(right.severity) - getSeverityWeight(left.severity);
  if (severityDelta !== 0) {
    return severityDelta;
  }

  return left.title.localeCompare(right.title);
}

function getDisplayPacketSortPriority(input: {
  hasRegulatorMockContext: boolean;
  packet: UnifiedFindingDisplayPacket;
}) {
  let priority =
    getUnifiedFindingBaseSortPriority(input.packet.unifiedFindingId) +
    getSurfacingDecisionSortPriority(input.packet.surfacingDecision);

  if (input.hasRegulatorMockContext && (COVERAGE_FINDING_IDS.has(input.packet.unifiedFindingId) || input.packet.unifiedFindingId === "accessibility_risk_score")) {
    priority -= 100;
  }

  if (input.packet.presentationDecision.status === "surface") {
    priority += 20;
  } else if (input.packet.presentationDecision.status === "audit_only") {
    priority -= 10;
  } else {
    priority -= 20;
  }

  return priority;
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

function getTargetSurfaceTypes(target: FamilyPacketTargetRecord) {
  return getStringArray(target.supportedSurfaceTypes ?? target.sourceSurfaceTypes);
}

function isPrivacyControlsAuxiliaryTargetForFinding(
  findingId: string,
  target: FamilyPacketTargetRecord
) {
  const surfaceTypes = getTargetSurfaceTypes(target);
  const text = [typeof target.title === "string" ? target.title : null, typeof target.snippet === "string" ? target.snippet : null]
    .filter((value): value is string => Boolean(value))
    .join(" ")
    .toLowerCase();
  const canonicalUrl = typeof target.canonicalUrl === "string" ? target.canonicalUrl.toLowerCase() : "";

  if (findingId === "cookie_policy_present") {
    return (
      surfaceTypes.includes("privacy_choices") ||
      /cookie|tracking|privacy choices|your privacy choices|gpc|global privacy control|opt-out preference/i.test(text) ||
      /cookie|privacy|choices/.test(canonicalUrl)
    );
  }

  if (findingId === "targeted_advertising_choices_present") {
    return (
      surfaceTypes.includes("cookie_policy_or_settings") ||
      /privacy choices|your privacy choices|opt out|do not sell|do not share|gpc|global privacy control/i.test(text) ||
      /privacy|choices|opt-out|do-not-sell/.test(canonicalUrl)
    );
  }

  if (findingId === "privacy_rights_path_present") {
    return (
      surfaceTypes.includes("privacy_choices") ||
      /privacy rights|access request|delete request|correction|your privacy choices/i.test(text) ||
      /privacy|rights|choices/.test(canonicalUrl)
    );
  }

  return false;
}

function getEffectiveFamilyPacketTargets(input: {
  canonicalTargets: FamilyPacketTargetRecord[];
  familyId: string;
  findingId: string;
  sourceSurfaceTypes: string[];
}) {
  const matchingTargets = getMatchingFamilyPacketTargets(input.canonicalTargets, input.sourceSurfaceTypes);
  if (input.familyId !== "privacy_controls") {
    return matchingTargets;
  }

  const auxiliaryTargets = input.canonicalTargets.filter((target) => {
    if (matchingTargets.includes(target)) {
      return false;
    }

    return isPrivacyControlsAuxiliaryTargetForFinding(input.findingId, target);
  });

  return [...matchingTargets, ...auxiliaryTargets];
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

function getFamilyPacketSupportingRefSnippets(targets: FamilyPacketTargetRecord[]) {
  return uniqueStrings(
    targets.flatMap((target) => {
      const refs = Array.isArray(target.supportingRefs) ? (target.supportingRefs as Array<Record<string, unknown>>) : [];
      return refs.flatMap((ref) => [
        typeof ref.text === "string" ? ref.text : null,
        typeof ref.title === "string" ? ref.title : null,
        typeof ref.label === "string" ? ref.label : null
      ]);
    })
  );
}

function deriveSupportAccessUrlSnippet(url: string | null | undefined, findingId: string) {
  if (!url) {
    return null;
  }

  const normalizedUrl = url.toLowerCase();
  if (findingId === "contact_support_path_present") {
    if (/\/contact-us(?:\/|$)|\/contact(?:\/|$)/.test(normalizedUrl)) {
      return "Contact Us";
    }
    if (/\/help(?:\/|$)|\/help-center(?:\/|$)|\/support(?:\/|$)/.test(normalizedUrl)) {
      return "Help Center";
    }
    if (/\/feedback(?:\/|$)/.test(normalizedUrl)) {
      return "Feedback";
    }
    if (/\/chat(?:\/|$)/.test(normalizedUrl)) {
      return "Chat";
    }
  }

  if (findingId === "accessibility_support_path_present") {
    if (/\/accessibility(?:\/|$)|\/accessibility-support(?:\/|$)/.test(normalizedUrl)) {
      return "Accessibility Support";
    }
  }

  return null;
}

function getDerivedSupportAccessEvidenceSnippets(input: {
  findingId: string;
  pageUrls: string[];
  sourceUrls: string[];
}) {
  if (
    input.findingId !== "contact_support_path_present" &&
    input.findingId !== "accessibility_support_path_present"
  ) {
    return [] as string[];
  }

  return uniqueStrings(
    [...input.pageUrls, ...input.sourceUrls].map((url) => deriveSupportAccessUrlSnippet(url, input.findingId))
  );
}

function getDerivedFamilyPacketSurfaceSnippets(input: {
  familyId: string;
  findingId: string;
  targets: FamilyPacketTargetRecord[];
  supportingRefSnippets: string[];
}) {
  if (input.supportingRefSnippets.some((snippet) => isReadableSurfaceSnippet(snippet))) {
    return [] as string[];
  }

  if (input.familyId !== "support_access") {
    return [] as string[];
  }

  return uniqueStrings(
    input.targets.flatMap((target) => {
      const refs = Array.isArray(target.supportingRefs) ? (target.supportingRefs as Array<Record<string, unknown>>) : [];
      return [
        deriveSupportAccessUrlSnippet(typeof target.canonicalUrl === "string" ? target.canonicalUrl : null, input.findingId),
        ...refs.map((ref) => deriveSupportAccessUrlSnippet(typeof ref.url === "string" ? ref.url : null, input.findingId))
      ];
    })
  );
}

function getFamilyPacketPolicySnippets(input: {
  familyId: string;
  findingId: string;
  targets: FamilyPacketTargetRecord[];
}) {
  const supportingRefSnippets = getFamilyPacketSupportingRefSnippets(input.targets);
  const derivedSurfaceSnippets = getDerivedFamilyPacketSurfaceSnippets({
    familyId: input.familyId,
    findingId: input.findingId,
    targets: input.targets,
    supportingRefSnippets
  });

  return rankSnippetsForFinding(input.findingId, uniqueStrings([
    ...input.targets.flatMap((target) => [
      typeof target.title === "string" ? target.title : null,
      typeof target.snippet === "string" ? target.snippet : null
    ]),
    ...supportingRefSnippets,
    ...derivedSurfaceSnippets
  ]))
    .map((snippet) => normalizePolicySnippet(snippet))
    .filter((snippet): snippet is string => Boolean(snippet));
}

function getFamilyPacketFetchQuality(targets: FamilyPacketTargetRecord[], snippets: string[]) {
  const explicitQualities = targets.flatMap((target) => {
    const value = typeof target.fetchQuality === "string" ? target.fetchQuality : null;
    return value === "verified_content" ||
      value === "thin_content" ||
      value === "blocked_interstitial" ||
      value === "unreachable"
      ? [value]
      : [];
  });
  const hasReadableSnippet = snippets.some((snippet) => isReadableSurfaceSnippet(snippet));
  const targetUrls = targets
    .map((target) => (typeof target.canonicalUrl === "string" ? target.canonicalUrl : null))
    .filter((value): value is string => Boolean(value));
  const hasMultipleHumanFacingUrls = uniqueStrings(targetUrls).filter((url) => hasConcreteHumanFacingUrl([url])).length >= 2;

  if (explicitQualities.includes("verified_content")) {
    return "verified_content" as const;
  }
  if (explicitQualities.includes("blocked_interstitial") && !(hasReadableSnippet && hasMultipleHumanFacingUrls)) {
    return "blocked_interstitial" as const;
  }
  if (explicitQualities.includes("thin_content")) {
    return "thin_content" as const;
  }
  if (explicitQualities.includes("blocked_interstitial") && hasReadableSnippet) {
    return "verified_content" as const;
  }
  if (explicitQualities.includes("unreachable")) {
    return "unreachable" as const;
  }
  if (snippets.some((snippet) => isBlockedOrInterstitialSnippet(snippet))) {
    return "blocked_interstitial" as const;
  }
  if (targets.length > 0 && snippets.length > 0) {
    return "verified_content" as const;
  }
  if (targets.length > 0) {
    return "thin_content" as const;
  }
  return null;
}

function buildFamilyPacketFallbackEvidence(input: {
  familyId: string;
  familyTargets: FamilyPacketTargetRecord[];
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
  const evidencePayload = normalizeUnifiedFindingEvidenceRecord(
    input.findingRecord.evidencePayload && typeof input.findingRecord.evidencePayload === "object"
      ? (input.findingRecord.evidencePayload as Record<string, unknown>)
      : {}
  );
  const payloadPageUrls = uniqueStrings([
    ...(Array.isArray(evidencePayload.pageUrls) ? (evidencePayload.pageUrls as string[]) : []),
    ...(Array.isArray(evidencePayload.evidenceUrls) ? (evidencePayload.evidenceUrls as string[]) : []),
    typeof evidencePayload.pageUrl === "string" ? evidencePayload.pageUrl : null
  ]);
  const payloadSourceUrls = uniqueStrings([
    ...(Array.isArray(evidencePayload.sourceUrls) ? (evidencePayload.sourceUrls as string[]) : []),
    typeof evidencePayload.sourceUrl === "string" ? evidencePayload.sourceUrl : null
  ]);
  const payloadSnippets = uniqueStrings([
    ...(Array.isArray(evidencePayload.policySnippets) ? (evidencePayload.policySnippets as string[]) : []),
    ...(Array.isArray(evidencePayload.snippets) ? (evidencePayload.snippets as string[]) : []),
    ...(Array.isArray(evidencePayload.supportingSignals) ? (evidencePayload.supportingSignals as string[]) : []),
    typeof evidencePayload.policySnippet === "string" ? evidencePayload.policySnippet : null,
    typeof evidencePayload.policySummaryShort === "string" ? evidencePayload.policySummaryShort : null,
    typeof evidencePayload.observation === "string" ? evidencePayload.observation : null
  ])
    .map((snippet) => normalizePolicySnippet(snippet))
    .filter((snippet): snippet is string => Boolean(snippet));
  const mergedPageUrls = sortUrlsByTargetStrength(uniqueStrings([...input.pageUrls, ...payloadPageUrls]), input.familyTargets);
  const mergedSourceUrls = sortUrlsByTargetStrength(uniqueStrings([...input.sourceUrls, ...payloadSourceUrls]), input.familyTargets);
  const mergedPolicySnippets = rankSnippetsForFinding(input.findingId, uniqueStrings([...input.policySnippets, ...payloadSnippets]));
  const keyPageTitleRecords = uniqueTitleRecords([
    ...input.familyTargets.flatMap((target) =>
      typeof target.title === "string" && typeof target.canonicalUrl === "string"
        ? [
            {
              title: target.title,
              url: target.canonicalUrl
            }
          ]
        : []
    ),
    ...(Array.isArray(evidencePayload.keyPageTitleRecords)
      ? (evidencePayload.keyPageTitleRecords as Array<Record<string, unknown>>)
          .flatMap((record) =>
            typeof record?.title === "string" && typeof record?.url === "string"
              ? [{ title: record.title, url: record.url }]
              : []
          )
      : [])
  ]);
  const bestSnippet =
    mergedPolicySnippets.find((snippet) => hasFindingSpecificSurfaceSnippet(input.findingId, [snippet])) ??
    mergedPolicySnippets.find((snippet) => isReadableSurfaceSnippet(snippet)) ??
    input.firstSnippet;
  const preferredPageUrl = mergedPageUrls[0] ?? input.firstPageUrl;

  return {
    ...evidencePayload,
    fetchQuality:
      (typeof evidencePayload.fetchQuality === "string" &&
      ["verified_content", "thin_content", "blocked_interstitial", "unreachable"].includes(evidencePayload.fetchQuality)
        ? (evidencePayload.fetchQuality as FetchQuality)
        : getFamilyPacketFetchQuality(input.familyTargets, mergedPolicySnippets)),
    familyPacketCanonicalUrl: preferredPageUrl,
    familyPacketFamilyId: input.familyId,
    familyPacketFindingId: input.findingId,
    familyPacketSourceSurfaceTypes: input.sourceSurfaceTypes,
    familyPacketSourceUrls: input.sourceUrls,
    familyPacketSupportedFindings: input.supportedUnifiedFindings
      .map((entry) => (typeof entry.findingId === "string" ? entry.findingId : null))
      .filter((value): value is string => Boolean(value)),
    familyPacketVerified: true,
    pageUrl: preferredPageUrl,
    pageUrls: mergedPageUrls,
    keyPageTitleRecords,
    policyIsPrimarySource: true,
    policyPageType: input.policyPageType,
    policySnippets: mergedPolicySnippets,
    policySummaryShort: bestSnippet,
    sourceUrl: mergedSourceUrls[0] ?? preferredPageUrl ?? null,
    sourceUrls: mergedSourceUrls
  };
}

function createInitialUnifiedFindingPacket(
  definition: NonNullable<ReturnType<typeof getReportUnifiedFinding>>,
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
      hasCorroboratedPositiveSurfaceEvidence: false,
      hasDirectRuntimeEvidence: false,
      hasKeyPageDiscoveryEvidence: false,
      hasReadableSurfaceSnippetEvidence: false,
      hasMultipleHumanFacingUrls: false,
      hasPageAttribution: false,
      hasPacketBackedEvidence: false,
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
  const nextNegativeEvidenceFlags = uniqueConcernFlags([
    ...(existing?.negativeEvidenceFlags ?? []),
    ...(candidate.normalizedConcern?.negativeEvidenceFlags ?? [])
  ]);
  const hasEligibleConcern =
    (
      candidate.normalizedConcern?.promotionEligibility === "eligible" &&
      candidate.normalizedConcern.externalSurfacingEligibility === "eligible"
    ) ||
    (
      existing?.promotionEligibilities.includes("eligible") === true &&
      existing.externalSurfacingEligibilities.includes("eligible") === true
    );
  const negativeEvidenceFlags = hasEligibleConcern
    ? nextNegativeEvidenceFlags.filter(
        (flag) =>
          flag !== "positive_surface_content_unverified" &&
          flag !== "missing_privacy_specific_contact_channel"
      )
    : nextNegativeEvidenceFlags;

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
    negativeEvidenceFlags,
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

function mergeUnifiedFindingDetails(
  existing: UnifiedFindingDetails | undefined,
  next: UnifiedFindingDetails | undefined
): UnifiedFindingDetails | undefined {
  if (!next) {
    return existing;
  }
  if (!existing || existing.family !== next.family) {
    return next;
  }

  switch (existing.family) {
    case "consent_tracking": {
      const e = existing as Extract<UnifiedFindingDetails, { family: "consent_tracking" }>;
      const n = next as Extract<UnifiedFindingDetails, { family: "consent_tracking" }>;
      return {
        ...n,
        vendors: uniqueStrings([...(e.vendors ?? []), ...(n.vendors ?? [])]),
        requestUrls: uniqueStrings([...(e.requestUrls ?? []), ...(n.requestUrls ?? [])])
      };
    }
    case "contradiction": {
      const e = existing as Extract<UnifiedFindingDetails, { family: "contradiction" }>;
      const n = next as Extract<UnifiedFindingDetails, { family: "contradiction" }>;
      return {
        ...n,
        runtimeEvidenceArtifacts: uniqueStrings([
          ...(e.runtimeEvidenceArtifacts ?? []),
          ...(n.runtimeEvidenceArtifacts ?? [])
        ]),
        vendors: uniqueStrings([...(e.vendors ?? []), ...(n.vendors ?? [])])
      };
    }
    case "rights_gap": {
      const e = existing as Extract<UnifiedFindingDetails, { family: "rights_gap" }>;
      const n = next as Extract<UnifiedFindingDetails, { family: "rights_gap" }>;
      return {
        ...n,
        unmatchedItems: uniqueStrings([...(e.unmatchedItems ?? []), ...(n.unmatchedItems ?? [])])
      };
    }
    case "sensitive_data": {
      const e = existing as Extract<UnifiedFindingDetails, { family: "sensitive_data" }>;
      const n = next as Extract<UnifiedFindingDetails, { family: "sensitive_data" }>;
      return {
        ...n,
        dataTypes: uniqueStrings([...(e.dataTypes ?? []), ...(n.dataTypes ?? [])])
      };
    }
    case "accessibility": {
      const e = existing as Extract<UnifiedFindingDetails, { family: "accessibility" }>;
      const n = next as Extract<UnifiedFindingDetails, { family: "accessibility" }>;
      return {
        ...n,
        ruleExamples: uniqueStrings([...(e.ruleExamples ?? []), ...(n.ruleExamples ?? [])])
      };
    }
    case "coverage_gap": {
      const e = existing as Extract<UnifiedFindingDetails, { family: "coverage_gap" }>;
      const n = next as Extract<UnifiedFindingDetails, { family: "coverage_gap" }>;
      return {
        ...n,
        attemptedUrls: uniqueStrings([...(e.attemptedUrls ?? []), ...(n.attemptedUrls ?? [])])
      };
    }
    default:
      return next;
  }
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
  input.packet.evidence = augmentAccessibilityAuditEvidence({
    evidence: input.packet.evidence,
    fallbackEvidence: input.candidate.fallbackEvidence ?? null,
    findingId: input.findingId
  });
  input.packet.evidence = sanitizeEvidenceForFinding(input.findingId, input.packet.evidence);

  const attributedUrls = uniqueStrings([
    ...(input.packet.evidence?.pageUrls ?? []),
    ...(input.packet.evidence?.sourceUrls ?? []),
    input.linkedValidationFinding?.pageUrl ?? null
  ]);

  input.packet.primaryPageUrl = attributedUrls[0] ?? null;
  input.packet.affectedPageCount = attributedUrls.length;
  input.packet.details = mergeUnifiedFindingDetails(
    input.packet.details,
    buildUnifiedFindingDetails({
      fallbackEvidence: input.candidate.fallbackEvidence ?? null,
      findingId: input.findingId,
      linkedValidationFinding: input.linkedValidationFinding,
      observedValue: input.candidate.observedValue,
      summary: input.candidate.description
    })
  );
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
        if (!findingId || !definition || !packetizedSupportRule) {
          continue;
        }

        const sourceSurfaceTypes = getStringArray(finding.sourceSurfaceTypes);
        const matchingTargets = getEffectiveFamilyPacketTargets({
          canonicalTargets,
          familyId,
          findingId,
          sourceSurfaceTypes
        });

        const pageUrls = uniqueStrings([
          ...getStringArray(finding.evidenceUrls),
          ...matchingTargets.flatMap((target) => (typeof target.canonicalUrl === "string" ? [target.canonicalUrl] : []))
        ]);
        const sourceUrls = getFamilyPacketSourceUrls(matchingTargets);
        const policySnippets = getFamilyPacketPolicySnippets({
          familyId,
          findingId,
          targets: matchingTargets
        });

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
            familyTargets: matchingTargets,
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

  const directlyResolvedId =
    candidate.sourceType === "signal" && candidate.signalSource && candidate.signalKey
      ? getReportUnifiedFindingForSignal(candidate.signalSource, candidate.signalKey)?.id ??
          getReportUnifiedFindingByAlias(candidate.title)?.id ??
          null
      : getReportUnifiedFindingByAlias(candidate.title)?.id ??
          (candidate.linkedValidationFinding
            ? getReportUnifiedFindingForValidationRule(candidate.linkedValidationFinding.ruleKey)?.id ?? null
            : null);

  return remapRawSignalFindingIdFromFallback({
    currentFindingId: directlyResolvedId,
    fallbackEvidence: candidate.fallbackEvidence ?? null
  });
}

function hasRetainedPolicyPositiveEvidence(candidate: UnifiedFindingCandidate) {
  if (!candidate.signalKey || !isPolicyPositiveSignalKey(candidate.signalKey)) {
    return false;
  }

  const evidence = candidate.fallbackEvidence ?? {};
  const snippets = Array.isArray(evidence.policySnippets)
    ? evidence.policySnippets.filter((value): value is string => isMeaningfulPolicyText(value))
    : [];
  const pageUrls = [
    ...(Array.isArray(evidence.pageUrls) ? evidence.pageUrls : []),
    ...(typeof evidence.pageUrl === "string" ? [evidence.pageUrl] : []),
    ...(Array.isArray(evidence.sourceUrls) ? evidence.sourceUrls : [])
  ].filter((value): value is string => typeof value === "string" && /^https?:\/\//i.test(value));

  return snippets.length > 0 && pageUrls.length > 0;
}

function remapRawSignalFindingIdFromFallback(input: {
  currentFindingId: string | null;
  fallbackEvidence?: Record<string, unknown> | null;
}) {
  const fallback = input.fallbackEvidence;
  if (fallback) {
    const policyDsarMechanism =
      typeof fallback.policyDsarMechanism === "string"
        ? fallback.policyDsarMechanism
        : typeof fallback.policy_dsar_mechanism === "string"
          ? fallback.policy_dsar_mechanism
          : null;
    if (
      (!input.currentFindingId || input.currentFindingId === "policy_clarity_risk") &&
      (
        /^absent|none|missing|not_found$/i.test(policyDsarMechanism ?? "") ||
        fallback.sectionReviewNoDsarMechanism === true ||
        fallback.section_review_no_dsar_mechanism === true
      )
    ) {
      return "missing_dsar_mechanism";
    }
  }

  if (input.currentFindingId !== "targeted_advertising_choices_present" || !fallback) {
    return input.currentFindingId;
  }

  const attributedUrls = uniqueStrings([
    ...(Array.isArray(fallback.pageUrls) ? fallback.pageUrls.filter((value): value is string => typeof value === "string") : []),
    ...(Array.isArray(fallback.sourceUrls)
      ? fallback.sourceUrls.filter((value): value is string => typeof value === "string")
      : []),
    typeof fallback.pageUrl === "string" ? fallback.pageUrl : null,
    typeof fallback.sourceUrl === "string" ? fallback.sourceUrl : null
  ]);
  const policySnippets = uniqueStrings([
    ...(Array.isArray(fallback.policySnippets)
      ? fallback.policySnippets.filter((value): value is string => typeof value === "string")
      : []),
    typeof fallback.policySummaryShort === "string" ? fallback.policySummaryShort : null
  ]);
  const isGuessedOnly = fallback.keyPageGuessedOnly === true || fallback.key_page_guessed_only === true;
  const hasExplicitControlUrl = attributedUrls.some((value) => {
    if (!/privacy-choices|privacy_choices|your-privacy-choices|do-not-sell|do-not-share|opt-?out|ad-choices|cookie/i.test(value)) {
      return false;
    }

    if (!isGuessedOnly) {
      return true;
    }

    return !/\/(?:legal\/)?cookies\/?$/i.test(value);
  });
  const hasRightsLikeSnippet = policySnippets.some((value) =>
    /privacy rights|ccpa privacy rights|the right to access|the right to request|delete request|access request|correction request/i.test(
      value
    )
  );

  return !hasExplicitControlUrl && isGuessedOnly && hasRightsLikeSnippet
    ? "privacy_rights_path_present"
    : input.currentFindingId;
}

function stripGenericGuessedCookieProbeUrls(urls: string[], flags: string[]) {
  if (!flags.includes("guessed_only")) {
    return urls;
  }

  const nonCookieUrls = urls.filter((url) => !/\/(?:legal\/)?cookies\/?$/i.test(url));
  return nonCookieUrls.length > 0 ? nonCookieUrls : urls;
}

function resolveUnifiedFindingForCandidate(candidate: UnifiedFindingCandidate | ConcernBackedUnifiedFindingCandidate) {
  const findingId =
    ("normalizedConcern" in candidate ? candidate.normalizedConcern?.suggestedUnifiedFindingId : null) ??
    resolveUnifiedFindingIdForCandidate(candidate);

  return findingId ? getReportUnifiedFinding(findingId) : null;
}

export function buildUnifiedFindingPackets(input: {
  domainContext?: ScanDomainContext;
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
    return !findingId || !packetBackedFindingIds.has(findingId) || hasRetainedPolicyPositiveEvidence(candidate);
  });
  const synthesizedCandidates = synthesizeGenericReviewFindingCandidates([...reviewFindingCandidates, ...familyPacketCandidates]);
  const normalizedConcerns = buildNormalizedConcerns({
    domainContext: input.domainContext,
    reviewFindingCandidates: [...reviewFindingCandidates, ...familyPacketCandidates, ...synthesizedCandidates],
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

  return [...packets.values()].sort(compareUnifiedFindingPackets);
}

export function buildUnifiedFindingDisplayPackets(input: {
  coverageSummary?: UnifiedFindingCoverageSummary;
  macroEnrichment?: Record<string, unknown> | null;
  mergedSignals?: MergedSignalRecord[];
  policyEnrichment?: Array<Record<string, unknown>>;
  reviewFindingCandidates: UnifiedFindingCandidate[];
  scanEvents?: UnifiedFindingScanEvent[];
  validationFindings: ScanValidationFinding[];
  validationFindingLookup: Map<string, ScanValidationFinding>;
}) {
  const mergedSignalCandidates = input.mergedSignals
    ? buildReviewFindingCandidatesFromMergedSignals({
        macroEnrichment: input.macroEnrichment,
        mergedSignals: input.mergedSignals
      })
    : [];
  const policyEnrichmentCandidates = buildPolicyEnrichmentPositiveCandidates(input.policyEnrichment);
  const policyEnrichmentMissingContactCandidates = buildPolicyEnrichmentMissingContactCandidates(input.policyEnrichment);
  const policyEnrichmentClarityCandidates = buildPolicyEnrichmentClarityCandidates(input.policyEnrichment);
  const packets = buildUnifiedFindingPackets({
    domainContext: buildScanDomainContext(input.macroEnrichment),
    reviewFindingCandidates: [
      ...input.reviewFindingCandidates,
      ...mergedSignalCandidates,
      ...policyEnrichmentCandidates,
      ...policyEnrichmentMissingContactCandidates,
      ...policyEnrichmentClarityCandidates
    ],
    scanEvents: input.scanEvents,
    validationFindings: input.validationFindings
  });

  const repairedPackets = packets.map((packet) =>
    maybeRepairSurfaceTitleMismatchPacket(
      maybeRepairCookiePolicyPacketFromPolicyEnrichment({
        packet,
        policyEnrichment: input.policyEnrichment
      })
    )
  );
  const calibratedPackets = suppressContradictoryMissingSurfacePackets(repairedPackets);
  const surfacingEvaluation = evaluateUnifiedFindingSurfacing({
    packets: calibratedPackets
  });
  const surfacingDecisionById = new Map(
    surfacingEvaluation.debugDecisions.map((decision) => [decision.unifiedFindingId, decision] as const)
  );

  const displayPackets = calibratedPackets.map((packet, _index, rows): UnifiedFindingDisplayPacket => {
    const linkedValidationFinding = resolveLinkedValidationFindingForPacket(packet, input.validationFindingLookup);
    const surfacingDecision =
      surfacingDecisionById.get(packet.unifiedFindingId) ??
      ({
        appliedRules: ["unknown.conservative_fallback"],
        decisionReasons: ["No surfacing decision was available for this finding, so it was conservatively suppressed."],
        decisionState: "suppressed",
        family: "unknown",
        policyVersion: "v1",
        reportLane: "suppressed",
        reportable: false,
        surfaceTier: "support",
        supports: [],
        unifiedFindingId: packet.unifiedFindingId,
        usedFamilyDefault: false,
        usedFindingOverride: false
      } satisfies UnifiedFindingSurfacingDecision);

    const siblingRows = rows.filter((row) => row.unifiedFindingId !== packet.unifiedFindingId);
    const presentation = buildCanonicalReviewFindingPresentation(
      buildCanonicalPresentationInput(packet, linkedValidationFinding),
      siblingRows.map((row) => buildCanonicalPresentationSiblingInput(row))
    );
    const presentationDecision = buildLegacyPresentationDecisionFromSurfacing({
      coverageSummary: input.coverageSummary,
      packet,
      surfacingDecision
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
      sourceUrl: getSourceUrl(packet),
      surfacingDecision
    };
  });

  const hasRegulatorMockContext = displayPackets.some(
    (packet) => packet.unifiedFindingId === "regulator_operated_mock_investment_example"
  );

  return [...displayPackets].sort((left, right) => {
    const priorityDelta =
      getDisplayPacketSortPriority({ hasRegulatorMockContext, packet: right }) -
      getDisplayPacketSortPriority({ hasRegulatorMockContext, packet: left });
    if (priorityDelta !== 0) {
      return priorityDelta;
    }

    return compareUnifiedFindingPackets(left, right);
  });
}

export function getUnifiedFindingOwnerCategoryId(packet: UnifiedFindingPacket) {
  return packet.categoryAlignments.find((alignment) => alignment.relation === "owner")?.evidenceCategoryId ?? null;
}

export function getUnifiedFindingCategoryRelation(packet: UnifiedFindingPacket, categoryId: string) {
  return packet.categoryAlignments.find((alignment) => alignment.evidenceCategoryId === categoryId)?.relation ?? null;
}
