import type {
  NormalizedConcern,
  NormalizedConcernAssertionLevel,
  NormalizedConcernEvidenceStrengthFlag,
  NormalizedConcernExternalSurfacingEligibility,
  NormalizedConcernNegativeEvidenceFlag,
  NormalizedConcernPolicyPageType,
  NormalizedConcernPromotionEligibility,
  NormalizedConcernRegulatoryChecklistEligibility
} from "./normalized-concerns";
import { classifyConsentControlLabel } from "@certscore/contracts";
import { evaluateCookieRetentionReview } from "./cookie-retention-review";
import { evaluateConsentControlLifecycleEvidence } from "./consent-control-lifecycle";
import { evaluateConsentGovernanceDisclosureEvidence } from "./consent-governance-disclosure";
import { evaluateRuntimeVendorDisclosureEvidence } from "./runtime-vendor-disclosure";
import {
  evaluateFinancialJudgeInput,
  getFinancialValidationEvidenceBundle,
  isFinancialValidationFindingId
} from "./financial-validation-contract";
import { isRuntimeRequestEvidenceUrl } from "./report-facing-page-url";
import { getStoredFinancialJudgeOutput } from "./financial-judge-contract";
import {
  evaluateConcreteRuntimeContract,
  evaluateConsentGatedTrackingConflictContract,
  evaluatePolicyBehaviorConflictContract,
  evaluateStrongEvidenceContract,
  hasConcreteCrossDomainIdentifierSharingEvidence,
  hasConcretePreconsentArtifact,
  hasConcreteRtbCookieSyncEvidence,
  hasDirectSensitiveCollectionSurfaceArtifact,
  hasConcreteReplayArtifact,
  hasConcreteRetargetingArtifact,
  hasConcreteSensitivePayloadArtifact,
  hasConcreteSensitiveThirdPartyTrackingArtifact,
  hasScanLevelSensitiveSessionReplayCoPresenceArtifact,
  hasSensitiveSessionReplaySurfaceCooccurrenceArtifact,
  hasPreconsentSequenceEvidence,
  hasStrongAccessibilitySupportPathMissingEvidence,
  hasStrongFingerprintingEvidence,
  hasStrongPreconsentRuntimeEvidence,
  hasStrongSaleSharingControlsMissingEvidence,
  hasStrongRightsFrictionArtifact,
  hasNonConsentOverlayWithoutIndependentConsentEvidence,
  hasVerifiedConsentUiEvidence,
  evaluateConsentSurfaceGate
} from "./promotion-evidence-contracts";
import {
  hasConcreteSanitizedNetworkEvidence
} from "./sanitized-network-evidence";
import {
  derivePolicyPageTypeFromEvidence,
  derivePolicyPrimarySourceFromEvidence
} from "./policy-evidence-metadata";
import {
  hasBehaviorReproducedFocusManagementEvidence,
  hasCompleteExamplesForAccessibilityFinding,
  getRepresentativeAccessibilityExampleCoverage,
  hasExternallyPromotableAccessibilityExamples,
  hasOnlyDocumentMetadataAccessibilityExamples,
  hasPromotableKeyboardAccessibilityEvidence,
  hasPromotableSemanticLabelingAccessibilityEvidence
} from "./accessibility-evidence";
import {
  REJECT_TRACKING_CONFIRMATION_MIN_MS
} from "./reject-tracking-policy";
import {
  evaluateFindingEvidenceContractForRawEvidence
} from "./finding-evidence-contracts";

function uniqueStrings(values: Array<string | null | undefined>) {
  return [...new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))];
}

const ACCESSIBILITY_PAGE_ATTRIBUTION_IDS = new Set([
  "wcag_issue_summary",
  "contrast_failures",
  "focus_management_issue",
  "form_label_issues",
  "critical_form_completion_barrier",
  "keyboard_navigation_accessibility_issue",
  "link_name_issues",
  "keyboard_navigation_issues",
  "keyboard_only_task_completion_blocked",
  "focus_indicator_issues",
  "semantic_labeling_accessibility_issue",
  "text_alternative_accessibility_issue",
  "visual_contrast_accessibility_issue",
  "landmark_issues",
  "aria_issues",
  "accessibility_claim_mismatch"
]);

const DOMAIN_LEVEL_SENSITIVE_CONTEXT_IDS = new Set([
  "minors_or_age_gated_collection_context"
]);

const DOMAIN_LEVEL_CHILDREN_DISCLOSURE_IDS = new Set([
  "children_privacy_context_without_supporting_disclosure"
]);

const COVERAGE_GAP_SURFACE_MISSING_IDS = new Set([
  "privacy_policy_missing_surface",
  "terms_missing_surface",
  "cookie_policy_missing_surface",
  "accessibility_statement_missing_surface",
  "contact_page_missing_surface"
]);

const RETIRED_FINANCIAL_FINDING_IDS = new Set([
  "regulatory_registration_disclosure_absent",
  "unsubstantiated_testimonial_near_performance_claim",
  "leveraged_or_high_risk_product_promotion",
  "guaranteed_outcome_claim_detected"
]);

const BLOCKED_OR_INTERSTITIAL_TEXT_PATTERN =
  /unable to authorize your request|access denied|verify you are human|captcha|bot challenge|request blocked|security check|temporarily unavailable|forbidden|we(?:'|’)re sorry, but we were unable to authorize your request/i;

const GDPR_TRANSPARENCY_ARTICLE13_CHECKLIST_OBSERVED_TOPICS = new Set([
  "controller_contact",
  "processing_purposes",
  "legal_basis",
  "recipients_or_vendor_categories",
  "data_retention",
  "data_subject_rights",
  "international_transfers",
  "dpo_contact",
  "supervisory_authority"
]);

function hasTruthyArrayValue(value: unknown) {
  return Array.isArray(value) && value.some((entry) => typeof entry === "string" && entry.trim().length > 0);
}

function getCanonicalStringEvidence(
  evidence: Record<string, unknown> | null | undefined,
  keys: string[]
) {
  for (const key of keys) {
    const value = evidence?.[key];
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed.length > 0) {
        return trimmed;
      }
    }
  }

  return null;
}

function getBooleanEvidence(
  evidence: Record<string, unknown> | null | undefined,
  keys: string[]
) {
  for (const key of keys) {
    if (evidence?.[key] === true) {
      return true;
    }
    if (evidence?.[key] === false) {
      return false;
    }
  }

  return null;
}

function getFirstString(evidence: Record<string, unknown> | null | undefined, keys: string[]) {
  for (const key of keys) {
    if (typeof evidence?.[key] === "string") {
      const value = String(evidence[key]).trim();
      if (value.length > 0) {
        return value;
      }
    }
  }

  return null;
}

function getStringArrayValues(
  evidence: Record<string, unknown> | null | undefined,
  keys: string[]
) {
  const values: string[] = [];

  for (const key of keys) {
    const value = evidence?.[key];
    if (typeof value === "string" && value.trim().length > 0) {
      values.push(value.trim());
      continue;
    }

    if (!Array.isArray(value)) {
      continue;
    }

    for (const entry of value) {
      if (typeof entry === "string" && entry.trim().length > 0) {
        values.push(entry.trim());
      }
    }
  }

  return [...new Set(values)];
}

function getPolicySignalString(
  evidence: Record<string, unknown> | null | undefined,
  key: string
) {
  return getCanonicalStringEvidence(evidence, [key, key.replace(/[A-Z]/g, (char) => `_${char.toLowerCase()}`)]);
}

function getPolicySignalNumber(
  evidence: Record<string, unknown> | null | undefined,
  key: string
) {
  return getNumberEvidence(evidence, [key, key.replace(/[A-Z]/g, (char) => `_${char.toLowerCase()}`)]);
}

function getPolicySignalStringArray(
  evidence: Record<string, unknown> | null | undefined,
  key: string
) {
  return getStringArrayValues(evidence, [key, key.replace(/[A-Z]/g, (char) => `_${char.toLowerCase()}`)]);
}

function getFetchQuality(rawEvidence: Record<string, unknown> | null | undefined) {
  const value =
    typeof rawEvidence?.normalizedConcernFetchQuality === "string"
      ? rawEvidence.normalizedConcernFetchQuality
      : typeof rawEvidence?.fetchQuality === "string"
        ? rawEvidence.fetchQuality
        : typeof rawEvidence?.fetch_quality === "string"
          ? rawEvidence.fetch_quality
          : null;

  return value === "verified_content" ||
    value === "thin_content" ||
    value === "blocked_interstitial" ||
    value === "unreachable"
    ? value
    : null;
}

function getEvidenceTextCandidates(rawEvidence: Record<string, unknown> | null | undefined) {
  return getStringArrayValues(rawEvidence, [
    "claim",
    "description",
    "matchedSnippet",
    "observedBehavior",
    "policySnippet",
    "policySnippets",
    "policySummary",
    "policySummaryShort",
    "policy_summary",
    "policy_summary_short",
    "runtimeSummary",
    "snippet",
    "snippets",
    "sourceEvidence",
    "sourceTitle",
    "summary",
    "title"
  ]);
}

function getEvidenceUrlCandidates(rawEvidence: Record<string, unknown> | null | undefined) {
  return getStringArrayValues(rawEvidence, [
    "attemptedUrls",
    "cookiePolicyUrl",
    "cookie_policy_url",
    "evidenceUrls",
    "pageUrl",
    "pageUrls",
    "policySourceUrl",
    "policy_source_url",
    "policyUrl",
    "policy_url",
    "preconsent_tracker_evidence_urls",
    "privacyPolicyUrl",
    "privacy_policy_url",
    "requestUrls",
    "runtimeEvidenceUrls",
    "sourceUrl",
    "sourceUrls"
  ]).filter((value) => /^https?:\/\//i.test(value) && !isRuntimeRequestEvidenceUrl(value));
}

function hasBlockedOrInterstitialEvidence(rawEvidence: Record<string, unknown> | null | undefined) {
  const botBlockChallengeEvidence = getObjectEvidence(rawEvidence, [
    "botBlockChallengeEvidence",
    "bot_block_challenge_evidence"
  ]);
  const botBlockCoverageImpact =
    typeof botBlockChallengeEvidence?.coverageImpact === "string"
      ? botBlockChallengeEvidence.coverageImpact
      : typeof botBlockChallengeEvidence?.coverage_impact === "string"
        ? botBlockChallengeEvidence.coverage_impact
        : null;

  return (
    (botBlockChallengeEvidence?.blocked === true &&
      (botBlockCoverageImpact === "material" || botBlockCoverageImpact === "severe")) ||
    getFetchQuality(rawEvidence) === "blocked_interstitial" ||
    getEvidenceTextCandidates(rawEvidence).some((value) => BLOCKED_OR_INTERSTITIAL_TEXT_PATTERN.test(value))
  );
}

function hasPolicySideEvidence(
  rawEvidence: Record<string, unknown> | null | undefined,
  evidenceStrengthFlags: NormalizedConcernEvidenceStrengthFlag[]
) {
  return (
    evidenceStrengthFlags.includes("policy_text") ||
    getEvidenceTextCandidates(rawEvidence).some((value) => typeof value === "string" && value.trim().length > 0)
  );
}

function hasBehaviorSideEvidence(
  rawEvidence: Record<string, unknown> | null | undefined,
  evidenceStrengthFlags: NormalizedConcernEvidenceStrengthFlag[]
) {
  return (
    evidenceStrengthFlags.includes("direct_runtime") ||
    evidenceStrengthFlags.includes("concrete_payload") ||
    hasTruthyArrayValue(rawEvidence?.runtimeEvidence) ||
    hasTruthyArrayValue(rawEvidence?.runtimeEvidenceArtifacts) ||
    hasTruthyArrayValue(rawEvidence?.runtime_evidence_artifacts)
  );
}

function hasHumanFacingUrl(rawEvidence: Record<string, unknown> | null | undefined) {
  return getEvidenceUrlCandidates(rawEvidence).some((value) => /^https?:\/\//i.test(value));
}

function isReadablePositiveSurfaceSnippet(value: string | null | undefined) {
  if (!value) {
    return false;
  }

  const trimmed = value.trim();
  if (trimmed.length < 8 || BLOCKED_OR_INTERSTITIAL_TEXT_PATTERN.test(trimmed)) {
    return false;
  }

  const wordCount = trimmed.split(/\s+/).length;
  const looksLikeBrandOnly =
    trimmed.length <= 40 &&
    wordCount <= 4 &&
    /^[A-Z][A-Za-z&'.-]*(?:\s+[A-Z][A-Za-z&'.-]*)*$/.test(trimmed) &&
    !/privacy|terms|conditions|cookie|contact|support|help|rights|choices|accessibility/i.test(trimmed);
  return !looksLikeBrandOnly;
}

function hasMeaningfulReviewerSnippet(value: string | null | undefined) {
  if (!value) {
    return false;
  }

  const trimmed = value.trim();
  if (trimmed.length < 12 || BLOCKED_OR_INTERSTITIAL_TEXT_PATTERN.test(trimmed)) {
    return false;
  }

  return !/^(detected|observed|this signal is worth reviewer attention)\b/i.test(trimmed);
}

function isContactLikeUrl(value: string) {
  try {
    const parsed = new URL(value);
    return /contact|help|support|feedback|chat|customer-service/i.test(parsed.pathname);
  } catch {
    return /contact|help|support|feedback|chat|customer-service/i.test(value);
  }
}

function isCookieLikeUrl(value: string) {
  try {
    const parsed = new URL(value);
    return /cookie|privacy|legal|your-privacy-choices/i.test(parsed.pathname);
  } catch {
    return /cookie|privacy|legal|your-privacy-choices/i.test(value);
  }
}

function isPrivacyRightsMechanismUrl(value: string) {
  try {
    const parsed = new URL(value);
    return /privacy[-_/]?(?:rights|request|portal|center|choices)|data[-_/]?(?:request|access|deletion|delete|correction)|ccpa|consumer[-_/]?rights/i.test(
      parsed.pathname
    );
  } catch {
    return /privacy[-_/]?(?:rights|request|portal|center|choices)|data[-_/]?(?:request|access|deletion|delete|correction)|ccpa|consumer[-_/]?rights/i.test(
      value
    );
  }
}

function hasPrivacyRightsMechanismText(value: string) {
  return /(?:privacy rights|rights (?:portal|center)|privacy (?:portal|center|request)|(?:access|delete|deletion|correction|opt-out|data) request|request (?:access|deletion|correction|a copy)|submit (?:a )?request|exercise (?:your )?rights|privacy@|data protection officer|\bdpo\b|webform|request form)/i.test(
    value
  );
}

function hasPrivacySpecificContactText(value: string) {
  return /privacy@|privacy (?:team|office|department|request|contact|form|portal|preferences?)|(?:about|regarding|concerning) privacy|data protection officer|\bdpo\b|privacy rights|personal information (?:request|questions?|contact|preferences?)|data (?:request|protection|privacy)|contact us.{0,120}(?:privacy|personal information)|(?:privacy|personal information).{0,120}contact us/i.test(
    value
  );
}

function hasPrivacySpecificContactChannelEvidence(rawEvidence: Record<string, unknown> | null | undefined) {
  if (!rawEvidence) {
    return false;
  }

  const textCandidates = getEvidenceTextCandidates(rawEvidence);
  const channelType = getFirstString(rawEvidence, ["privacyContactChannelType", "privacy_contact_channel_type"]);
  if (channelType && !/^none|unknown|generic$/i.test(channelType)) {
    return textCandidates.some(hasPrivacySpecificContactText);
  }

  return textCandidates.some(hasPrivacySpecificContactText);
}

function hasPrivacyRightsMechanismEvidence(rawEvidence: Record<string, unknown> | null | undefined) {
  if (!rawEvidence) {
    return false;
  }

  const dsarMechanism = getFirstString(rawEvidence, ["policyDsarMechanism", "policy_dsar_mechanism"]);
  if (dsarMechanism && !/^none|unknown|absent|null$/i.test(dsarMechanism)) {
    return true;
  }

  const rightsSignals = getStringArrayValues(rawEvidence, ["policyRightsSignals", "policy_rights_signals"]);
  const hasActionableRightsSignal = rightsSignals.some((value) =>
    /access|delete|deletion|correct|correction|export|portable|opt[-_\s]?out|privacy_controls|privacy_contact|authorized_agent|appeal/i.test(value)
  );
  const snippets = getEvidenceTextCandidates(rawEvidence);

  return (
    snippets.some(hasPrivacyRightsMechanismText) ||
    getEvidenceUrlCandidates(rawEvidence).some(isPrivacyRightsMechanismUrl) ||
    (
      hasActionableRightsSignal &&
      snippets.some((value) => /\b(request|submit|form|portal|exercise|verify|confirm|contact|privacy@|data protection officer|\bdpo\b)\b/i.test(value))
    )
  );
}

function hasPolicyPositiveTopicSnippet(
  rawEvidence: Record<string, unknown> | null | undefined,
  topicPattern: RegExp
) {
  const topic = getFirstString(rawEvidence, ["policyPositiveTopic", "policy_positive_topic"]);
  const keys = getStringArrayValues(rawEvidence, ["policyPositiveSnippetKeys", "policy_positive_snippet_keys"]);
  const snippets = getEvidenceTextCandidates(rawEvidence).filter(hasMeaningfulReviewerSnippet);
  return (
    snippets.length > 0 &&
    (
      (topic !== null && topicPattern.test(topic)) ||
      keys.some((key) => topicPattern.test(key))
    )
  );
}

function isTermsLikeUrl(value: string) {
  try {
    const parsed = new URL(value);
    return /terms|conditions|tos/i.test(parsed.pathname);
  } catch {
    return /terms|conditions|tos/i.test(value);
  }
}

function hasPacketBackedSurfaceEvidence(
  concern: Pick<NormalizedConcern, "suggestedUnifiedFindingId">,
  rawEvidence: Record<string, unknown> | null | undefined
) {
  if (!rawEvidence) {
    return false;
  }

  const expectedFindingId = concern.suggestedUnifiedFindingId ?? "";
  return (
    rawEvidence.familyPacketVerified === true ||
    rawEvidence.familyPacketFindingId === expectedFindingId ||
    rawEvidence.familyPacketFamilyId !== undefined
  );
}

function getPositiveInfrastructureEvidenceGrade(
  concern: Pick<NormalizedConcern, "suggestedUnifiedFindingId">,
  rawEvidence: Record<string, unknown> | null | undefined
) {
  const fetchQuality = getFetchQuality(rawEvidence);
  if (!rawEvidence || fetchQuality === "unreachable") {
    return "weak" as const;
  }

  const blockedOrInterstitialEvidence = hasBlockedOrInterstitialEvidence(rawEvidence);
  const urls = getEvidenceUrlCandidates(rawEvidence);
  const snippets = getEvidenceTextCandidates(rawEvidence).filter(isReadablePositiveSurfaceSnippet);
  const haystack = `${urls.join(" ")} ${snippets.join(" ")}`.toLowerCase();
  const hasPacketBacking = hasPacketBackedSurfaceEvidence(concern, rawEvidence);
  const humanFacingUrlCount = urls.filter((value) => /^https?:\/\//i.test(value)).length;
  const verifiedBySnippet = snippets.length > 0 && humanFacingUrlCount > 0;

  if (concern.suggestedUnifiedFindingId === "accessibility_support_path_present") {
    if (
      rawEvidence.accessibilityContactMethodPresent === true ||
      (hasPacketBacking &&
        humanFacingUrlCount >= 1 &&
        snippets.some((value) => /accessibility|accommodation|caption|assistive/i.test(value))) ||
      (!blockedOrInterstitialEvidence &&
        fetchQuality !== "thin_content" &&
        verifiedBySnippet &&
        /accessibility|accommodation|caption|assistive/i.test(haystack))
    ) {
      return "verified" as const;
    }

    return "weak" as const;
  }

  if (!blockedOrInterstitialEvidence && fetchQuality !== "thin_content" && verifiedBySnippet) {
    switch (concern.suggestedUnifiedFindingId) {
      case "contact_support_path_present":
      case "operator_contact_path_present":
        return snippets.some((value) => /contact|help|support|feedback|chat|branch|call/i.test(value))
          ? "verified" as const
          : "weak" as const;
      case "cookie_policy_present":
        return snippets.some((value) => /cookie|privacy choices|privacy settings|manage cookies/i.test(value))
          ? "verified" as const
          : "weak" as const;
      case "privacy_policy_present":
        return snippets.some((value) => /privacy|security statement|privacy statement|privacy notice|privacy policy/i.test(value))
          ? "verified" as const
          : "weak" as const;
      case "terms_of_service_present":
        return snippets.some((value) => /terms|conditions|terms of use|terms of sale|arbitration|tos/i.test(value))
          ? "verified" as const
          : "weak" as const;
      case "targeted_advertising_choices_present":
        return snippets.some((value) => /do not sell|opt out|privacy choices|ad choices|targeted advertising/i.test(value))
          ? "verified" as const
          : "weak" as const;
      case "affiliate_disclosure_present":
        return snippets.some((value) => /affiliate|commission|we may earn|paid link|qualifying purchases?/i.test(value))
          ? "verified" as const
          : "weak" as const;
      case "privacy_rights_path_present":
        return hasPrivacyRightsMechanismEvidence(rawEvidence)
          ? "verified" as const
          : "weak" as const;
      case "privacy_contact_path_present":
        return hasPrivacySpecificContactChannelEvidence(rawEvidence)
          ? "verified" as const
          : "weak" as const;
      case "legal_basis_disclosure_present":
        return hasPolicyPositiveTopicSnippet(rawEvidence, /legal_basis|legal basis|lawful basis|legitimate interests?|contractual necessity/i)
          ? "verified" as const
          : "weak" as const;
      case "retention_disclosure_present":
        return hasPolicyPositiveTopicSnippet(rawEvidence, /retention|retain|kept for|storage period|as long as necessary/i)
          ? "verified" as const
          : "weak" as const;
      case "gpc_disclosure_present":
        return hasPolicyPositiveTopicSnippet(rawEvidence, /\bgpc(?:_disclosure)?\b|global privacy control/i)
          ? "verified" as const
          : "weak" as const;
      case "tracking_technologies_disclosure_present":
        return hasPolicyPositiveTopicSnippet(rawEvidence, /tracking_technologies|cookie|pixel|beacon|tag/i)
          ? "verified" as const
          : "weak" as const;
      case "third_party_advertising_disclosure_present":
        return hasPolicyPositiveTopicSnippet(rawEvidence, /third_party_advertising|advertising/i)
          ? "verified" as const
          : "weak" as const;
      case "targeted_advertising_disclosure_present":
        return hasPolicyPositiveTopicSnippet(rawEvidence, /targeted_advertising|sale|sharing|advertising/i)
          ? "verified" as const
          : "weak" as const;
      case "behavioral_analytics_disclosure_present":
        return hasPolicyPositiveTopicSnippet(rawEvidence, /behavioral_analytics|session_replay|product_analytics/i)
          ? "verified" as const
          : "weak" as const;
      case "supervisory_authority_disclosure_present":
        return hasPolicyPositiveTopicSnippet(rawEvidence, /supervisory_authority|supervisory authority|data protection authority|lodge a complaint/i)
          ? "verified" as const
          : "weak" as const;
      case "automated_decision_profiling_disclosure_present":
        return hasPolicyPositiveTopicSnippet(rawEvidence, /automated_decision|automated decision(?:-making| making)?|solely automated (?:processing|decision)|meaningful information about the logic involved|legal or similarly significant effects|similarly significant effects|\bprofiling\b/i)
          ? "verified" as const
          : "weak" as const;
      case "children_privacy_disclosure_present":
        return hasPolicyPositiveTopicSnippet(rawEvidence, /children/i)
          ? "verified" as const
          : "weak" as const;
      default:
        return snippets.some((value) => value.trim().length >= 8) ? "verified" as const : "weak" as const;
    }
  }

  switch (concern.suggestedUnifiedFindingId) {
    case "contact_support_path_present":
    case "operator_contact_path_present": {
      const corroboratingContactUrls = urls.filter(isContactLikeUrl).length;
      return hasPacketBacking && corroboratingContactUrls >= 2 ? "corroborated" as const : "weak" as const;
    }
    case "privacy_policy_present":
      return hasPacketBacking &&
        snippets.some((value) => /privacy|security statement|privacy statement|privacy notice|privacy policy/i.test(value)) &&
        humanFacingUrlCount >= 1
        ? "corroborated" as const
        : "weak" as const;
    case "terms_of_service_present":
      return hasPacketBacking &&
        snippets.some((value) => /terms|conditions|terms of use|terms of sale|arbitration/i.test(value)) &&
        humanFacingUrlCount >= 1
        ? "corroborated" as const
        : "weak" as const;
    case "cookie_policy_present": {
      return hasPacketBacking &&
        snippets.some((value) => /cookie|privacy choices|privacy settings|manage cookies/i.test(value)) &&
        humanFacingUrlCount >= 1
        ? "corroborated" as const
        : "weak" as const;
    }
    case "accessibility_support_path_present":
      return hasPacketBacking &&
        humanFacingUrlCount >= 1 &&
        snippets.some((value) => /accessibility|accommodation|caption|assistive/i.test(value))
        ? "corroborated" as const
        : "weak" as const;
    case "privacy_rights_path_present":
      return hasPacketBacking &&
        hasPrivacyRightsMechanismEvidence(rawEvidence) &&
        humanFacingUrlCount >= 1
        ? "corroborated" as const
        : "weak" as const;
    case "targeted_advertising_choices_present":
      return hasPacketBacking &&
        snippets.some((value) => /do not sell|opt out|privacy choices|ad choices|targeted advertising/i.test(value)) &&
        humanFacingUrlCount >= 1
        ? "corroborated" as const
        : "weak" as const;
    case "affiliate_disclosure_present":
      return hasPacketBacking &&
        snippets.some((value) => /affiliate|commission|we may earn|paid link|qualifying purchases?/i.test(value)) &&
        humanFacingUrlCount >= 1
        ? "corroborated" as const
        : "weak" as const;
    case "privacy_contact_path_present":
      return hasPacketBacking &&
        hasPrivacySpecificContactChannelEvidence(rawEvidence) &&
        humanFacingUrlCount >= 1
        ? "corroborated" as const
        : "weak" as const;
    case "gpc_disclosure_present":
    case "legal_basis_disclosure_present":
    case "retention_disclosure_present":
    case "tracking_technologies_disclosure_present":
    case "third_party_advertising_disclosure_present":
    case "targeted_advertising_disclosure_present":
    case "behavioral_analytics_disclosure_present":
    case "supervisory_authority_disclosure_present":
    case "automated_decision_profiling_disclosure_present":
    case "children_privacy_disclosure_present":
      return hasPacketBacking &&
        snippets.some(hasMeaningfulReviewerSnippet) &&
        humanFacingUrlCount >= 1
        ? "corroborated" as const
        : "weak" as const;
    default:
      return "weak" as const;
  }
}

function hasVerifiedPositiveInfrastructureEvidence(
  concern: Pick<NormalizedConcern, "suggestedUnifiedFindingId">,
  rawEvidence: Record<string, unknown> | null | undefined
) {
  return getPositiveInfrastructureEvidenceGrade(concern, rawEvidence) === "verified";
}

export function hasStrongRightsFrictionEvidence(evidence: Record<string, unknown> | null | undefined) {
  return hasStrongRightsFrictionArtifact(evidence);
}

export function hasSensitivePayloadEvidence(evidence: Record<string, unknown> | null | undefined) {
  return hasConcreteSensitivePayloadArtifact(evidence);
}

function hasSensitiveCollectionSurfaceEvidence(evidence: Record<string, unknown> | null | undefined) {
  return (
    hasDirectSensitiveCollectionSurfaceArtifact(evidence) ||
    evidence?.sensitiveCollectionSurfaceObserved === true ||
    evidence?.sensitive_collection_surface_observed === true ||
    evidence?.highSensitivityDataCollectionDetected === true ||
    evidence?.high_sensitivity_data_collection_detected === true ||
    getStringArrayValues(evidence, [
      "sensitiveFieldSelectors",
      "sensitive_field_selectors",
      "sensitiveFieldLabels",
      "sensitive_field_labels",
      "sensitiveFieldTypes",
      "sensitive_field_types",
      "sensitiveFormUrls",
      "sensitive_form_urls"
    ]).length > 0
  );
}

export function hasConcreteSessionReplayEvidence(evidence: Record<string, unknown> | null | undefined) {
  return hasConcreteReplayArtifact(evidence);
}

export function hasConcreteRetargetingEvidence(evidence: Record<string, unknown> | null | undefined) {
  return hasConcreteRetargetingArtifact(evidence);
}

function hasVideoContentSurfaceEvidence(evidence: Record<string, unknown> | null | undefined) {
  return (
    getBooleanEvidence(evidence, ["videoContentSurfaceObserved", "video_content_surface_observed"]) === true ||
    getStringArrayValues(evidence, ["videoPageUrls", "video_page_urls"]).length > 0 ||
    getStringArrayValues(evidence, ["videoTitleSnippets", "video_title_snippets"]).length > 0
  );
}

function hasMetaPixelEvidence(evidence: Record<string, unknown> | null | undefined) {
  const vendors = getStringArrayValues(evidence, [
    "runtimeVendors",
    "runtime_vendors",
    "relatedVendors",
    "related_vendors"
  ]);
  const requestUrls = getStringArrayValues(evidence, [
    "metaPixelRequestUrls",
    "meta_pixel_request_urls",
    "runtimeRequestUrls",
    "runtime_request_urls",
    "runtimeEvidenceUrls",
    "runtime_evidence_urls"
  ]);

  return vendors.some((value) => /meta\s+pixel|facebook/i.test(value)) ||
    requestUrls.some((value) => /facebook\.com|facebook\.net|fbevents\.js|\/tr\//i.test(value));
}

function hasSamePageVideoTrackingCorrelation(evidence: Record<string, unknown> | null | undefined) {
  return getBooleanEvidence(evidence, [
    "samePageVideoTrackingCorrelation",
    "same_page_video_tracking_correlation"
  ]) === true;
}

function hasVideoPayloadFieldHints(evidence: Record<string, unknown> | null | undefined) {
  return getStringArrayValues(evidence, [
    "metaPixelPayloadFieldHints",
    "meta_pixel_payload_field_hints"
  ]).some((value) => /content|video|title|page|dl|rl|ev/i.test(value));
}

export function hasConcreteDsarEvidence(evidence: Record<string, unknown> | null | undefined) {
  if (!evidence) {
    return false;
  }

  const dsarMechanism = getPolicySignalString(evidence, "policyDsarMechanism");
  const policySemanticConfidence = getPolicySignalNumber(evidence, "policySemanticConfidence");
  const extractionStatus = getPolicyExtractionStatus(evidence);
  const policyRightsSignals = getPolicyRightsSignals(evidence);
  const hasExplicitAbsenceSignal =
    /^absent|none|missing|not_found$/i.test(dsarMechanism ?? "") ||
    evidence.sectionReviewNoDsarMechanism === true ||
    evidence.section_review_no_dsar_mechanism === true ||
    getStringArrayValues(evidence, ["evidenceFlags", "flags"]).some((flag) => flag === "policy_field:dsar_path:absent");

  return (
    hasExplicitAbsenceSignal &&
    !hasPrivacyRightsMechanismEvidence(evidence) &&
    extractionStatus === "fetched" &&
    typeof policySemanticConfidence === "number" &&
    policySemanticConfidence >= 0.6 &&
    policyRightsSignals.length === 0
  );
}

function isReplayConcern(
  concern: Pick<NormalizedConcern, "canonicalConcernKey" | "suggestedUnifiedFindingId" | "originKey" | "title">
) {
  const haystack = [
    concern.canonicalConcernKey,
    concern.suggestedUnifiedFindingId,
    concern.originKey,
    concern.title
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return /session_replay|replay\/disclosure|undisclosed session replay|possible replay/.test(haystack);
}

export function concernRequiresDirectRuntime(
  concern: Pick<NormalizedConcern, "canonicalConcernKey" | "suggestedUnifiedFindingId" | "originKey" | "title">
) {
  return isReplayConcern(concern);
}

function isRightsFrictionConcern(
  concern: Pick<NormalizedConcern, "canonicalConcernKey" | "suggestedUnifiedFindingId" | "originKey" | "title">
) {
  const haystack = [
    concern.canonicalConcernKey,
    concern.suggestedUnifiedFindingId,
    concern.originKey,
    concern.title
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return /user_rights_friction|rights_fulfillment_friction|functional_misalignment|policy_runtime_functional_misalignment/.test(
    haystack
  );
}

function isHighSensitivityConcern(
  concern: Pick<NormalizedConcern, "canonicalConcernKey" | "suggestedUnifiedFindingId" | "originKey" | "title">
) {
  const haystack = [
    concern.canonicalConcernKey,
    concern.suggestedUnifiedFindingId,
    concern.originKey,
    concern.title
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return /high_sensitivity_data_collection_detected|form_collects_(ssn|government_id|health_information|financial_information|geolocation)|possible_session_replay_on_sensitive_input_surface|session_replay_present_with_sensitive_surfaces_observed|sensitive_data_collection_with_third_party_tracking_present/.test(
    haystack
  );
}

function isSensitiveReplayConcern(
  concern: Pick<NormalizedConcern, "suggestedUnifiedFindingId">
) {
  return concern.suggestedUnifiedFindingId === "possible_session_replay_on_sensitive_input_surface";
}

function isScanLevelSensitiveReplayConcern(
  concern: Pick<NormalizedConcern, "suggestedUnifiedFindingId">
) {
  return concern.suggestedUnifiedFindingId === "session_replay_present_with_sensitive_surfaces_observed";
}

function isSensitiveThirdPartyTrackingConcern(
  concern: Pick<NormalizedConcern, "suggestedUnifiedFindingId">
) {
  return concern.suggestedUnifiedFindingId === "sensitive_data_collection_with_third_party_tracking_present";
}

function isDsarConcern(concern: Pick<NormalizedConcern, "canonicalConcernKey" | "suggestedUnifiedFindingId" | "originKey" | "title">) {
  if (concern.suggestedUnifiedFindingId === "privacy_rights_path_present") {
    return false;
  }

  const haystack = [
    concern.canonicalConcernKey,
    concern.suggestedUnifiedFindingId,
    concern.originKey,
    concern.title
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return /dsar|privacy-rights|missing_dsar|no dsar mechanism/.test(haystack);
}

function isCookieDisclosureGapConcern(
  concern: Pick<NormalizedConcern, "suggestedUnifiedFindingId">
) {
  return concern.suggestedUnifiedFindingId === "cookie_disclosure_gap";
}

function getStringArrayEvidence(
  evidence: Record<string, unknown> | null | undefined,
  keys: string[]
) {
  for (const key of keys) {
    const value = evidence?.[key];
    if (Array.isArray(value)) {
      return value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0);
    }
  }
  return [];
}

function getCookieDisclosureNumberEvidence(
  evidence: Record<string, unknown> | null | undefined,
  keys: string[]
) {
  for (const key of keys) {
    const value = evidence?.[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === "string" && value.trim().length > 0) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }
  return null;
}

function isIgnoredRuntimeCookieName(value: string) {
  return /^(awsalb|awsalbcors|__cf_bm|cf_clearance|optanonconsent|optanonalertboxclosed|geo_country|trp-country|trp-language)$/i.test(value.trim());
}

function hasOnlyIgnoredCookieDisclosureGapEvidence(evidence: Record<string, unknown> | null | undefined) {
  const runtimeCookieNames = getStringArrayEvidence(evidence, ["runtime_cookie_names", "runtimeCookieNames"]);
  const unmatchedCookieNames = getStringArrayEvidence(evidence, ["unmatched_cookie_names", "unmatchedCookieNames"]);
  const unmatchedThirdPartyCookieCount = getCookieDisclosureNumberEvidence(evidence, [
    "unmatched_third_party_cookie_count",
    "unmatchedThirdPartyCookieCount"
  ]);
  const candidateCookieNames = unmatchedCookieNames.length > 0 ? unmatchedCookieNames : runtimeCookieNames;

  return (
    candidateCookieNames.length > 0 &&
    candidateCookieNames.every(isIgnoredRuntimeCookieName) &&
    (unmatchedThirdPartyCookieCount ?? 0) === 0
  );
}

function isStructuredPolicyDisclosureGapConcern(
  concern: Pick<NormalizedConcern, "suggestedUnifiedFindingId">
) {
  return [
    "data_categories_disclosure_missing",
    "third_party_recipient_disclosure_missing",
    "purpose_of_use_disclosure_missing"
  ].includes(concern.suggestedUnifiedFindingId ?? "");
}

export function isPositiveInfrastructureConcern(
  concern: Pick<NormalizedConcern, "suggestedUnifiedFindingId">
) {
  return [
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
    "affiliate_disclosure_present",
    "accessibility_support_path_present",
    "arbitration_clause_present"
  ].includes(concern.suggestedUnifiedFindingId ?? "");
}

function isPreconsentConcern(
  concern: Pick<NormalizedConcern, "canonicalConcernKey" | "suggestedUnifiedFindingId" | "originKey" | "title">
) {
  const haystack = [
    concern.canonicalConcernKey,
    concern.suggestedUnifiedFindingId,
    concern.originKey,
    concern.title
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return /pre[-_ ]?consent|tracking_before_consent|tracking_cookies_before_consent|trackers_before_consent/.test(haystack);
}

function getPreSubmitTextCaptureEvidenceRows(rawEvidence: Record<string, unknown> | null | undefined) {
  const direct = Array.isArray(rawEvidence?.preSubmitTextCaptureEvidence)
    ? rawEvidence.preSubmitTextCaptureEvidence
    : Array.isArray(rawEvidence?.pre_submit_text_capture_evidence)
      ? rawEvidence.pre_submit_text_capture_evidence
      : [];
  const signalRows =
    rawEvidence?.signalKey === "privacy.pre_submit_text_capture_detected" && Array.isArray(rawEvidence.signalValue)
      ? rawEvidence.signalValue
      : [];
  return [...direct, ...signalRows].filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object");
}

function hasStrongPreSubmitTextCaptureEvidence(rawEvidence: Record<string, unknown> | null | undefined) {
  return getPreSubmitTextCaptureEvidenceRows(rawEvidence).some((row) => {
    const classification = String(row.destinationClassification ?? row.destination_classification ?? "");
    const submitObserved = row.submitObserved ?? row.submit_observed;
    return (
      submitObserved === false &&
      (classification === "third_party_tracking_hashed_identifier" ||
        classification === "third_party_tracking_raw_identifier")
    );
  });
}

function isPreSubmitTextCaptureConcern(
  concern: Pick<NormalizedConcern, "canonicalConcernKey" | "suggestedUnifiedFindingId" | "originKey" | "title">
) {
  const haystack = [
    concern.canonicalConcernKey,
    concern.suggestedUnifiedFindingId,
    concern.originKey,
    concern.title
  ].filter(Boolean).join(" ").toLowerCase();

  return /pre_submit_text_capture_detected|pre-submit text capture/.test(haystack);
}

function isRtbCookieSyncConcern(
  concern: Pick<NormalizedConcern, "canonicalConcernKey" | "suggestedUnifiedFindingId" | "originKey" | "title">
) {
  const haystack = [
    concern.canonicalConcernKey,
    concern.suggestedUnifiedFindingId,
    concern.originKey,
    concern.title
  ].filter(Boolean).join(" ").toLowerCase();

  return /rtb_cookie_sync|cookie sync|identity-sync|identity sync/.test(haystack);
}

function isRejectTrackingPersistenceConcern(
  concern: Pick<NormalizedConcern, "canonicalConcernKey" | "suggestedUnifiedFindingId" | "originKey" | "title">
) {
  const haystack = [
    concern.canonicalConcernKey,
    concern.suggestedUnifiedFindingId,
    concern.originKey,
    concern.title
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return /reject_did_not_reduce_tracking|reject_did_not_reduce_third_party_cookies|reject_tracking_persists_after_reject|reject.*tracking|reject.*third[-_ ]party.*cookies/.test(haystack);
}

function getObjectArrayEvidence(rawEvidence: Record<string, unknown> | null | undefined, keys: string[]) {
  for (const key of keys) {
    const value = rawEvidence?.[key];
    if (Array.isArray(value)) {
      return value.filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object" && !Array.isArray(entry));
    }
  }
  return [];
}

function getObjectEvidence(rawEvidence: Record<string, unknown> | null | undefined, keys: string[]) {
  for (const key of keys) {
    const value = rawEvidence?.[key];
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
  }
  return null;
}

function getNestedBooleanEvidence(
  rawEvidence: Record<string, unknown> | null | undefined,
  objectKeys: string[],
  booleanKeys: string[]
) {
  return getBooleanEvidence(getObjectEvidence(rawEvidence, objectKeys), booleanKeys);
}

function getNestedStringEvidence(
  rawEvidence: Record<string, unknown> | null | undefined,
  objectKeys: string[],
  stringKeys: string[]
) {
  return getFirstString(getObjectEvidence(rawEvidence, objectKeys), stringKeys);
}

function getOverlayKind(rawEvidence: Record<string, unknown> | null | undefined) {
  return (
    getFirstString(rawEvidence, ["overlayKind", "overlay_kind", "overlayType", "overlay_type", "blockerType", "blocker_type"]) ??
    getNestedStringEvidence(rawEvidence, ["overlayEvidence", "overlay_evidence", "hybridConsentSummary", "hybrid_consent_summary"], [
      "overlayKind",
      "overlay_kind",
      "overlayType",
      "overlay_type"
    ])
  );
}

function isNonConsentBlockingOverlayKind(value: string | null | undefined) {
  return Boolean(value && /bot|challenge|captcha|login|auth|paywall|subscribe|newsletter|age|regional|app_install|install/i.test(value));
}

function hasConsentSpecificOverlayEvidence(rawEvidence: Record<string, unknown> | null | undefined) {
  const overlayKind = getOverlayKind(rawEvidence);
  const labels = getStringArrayValues(rawEvidence, [
    "overlayActionLabels",
    "overlay_action_labels",
    "consentActionLabels",
    "consent_action_labels",
    "buttonLabels",
    "button_labels"
  ]);
  const snippets = getEvidenceTextCandidates(rawEvidence);
  const consentSurfaceObserved = getBooleanEvidence(rawEvidence, [
    "consentSurfaceObserved",
    "consent_surface_observed",
    "cookieBannerPresent",
    "consentBannerPresent"
  ]);
  const nestedConsentSurfaceObserved = getNestedBooleanEvidence(rawEvidence, [
    "hybridConsentSummary",
    "hybrid_consent_summary",
    "overlayEvidence",
    "overlay_evidence"
  ], ["bannerPresent", "banner_present", "consentSurfaceObserved", "consent_surface_observed"]);

  if (hasNonConsentOverlayWithoutIndependentConsentEvidence(rawEvidence)) {
    return false;
  }

  return (
    /consent|cookie|cmp|privacy|preferences?/i.test(overlayKind ?? "") ||
    consentSurfaceObserved === true ||
    nestedConsentSurfaceObserved === true ||
    labels.some((label) => /accept|reject|decline|consent|cookie|privacy|preferences?|manage choices/i.test(label)) ||
    snippets.some((snippet) => /accept all|reject all|manage (?:options|preferences|choices)|cookie (?:banner|preferences)|consent/i.test(snippet))
  );
}

function hasMaterialScanBlockingOverlayEvidence(rawEvidence: Record<string, unknown> | null | undefined) {
  const overlayKind = getOverlayKind(rawEvidence);
  const materialBlock =
    getBooleanEvidence(rawEvidence, [
      "keyContentBlocked",
      "key_content_blocked",
      "reportabilityMateriallyBlocked",
      "reportability_materially_blocked",
      "materiallyBlocked",
      "materially_blocked",
      "pageAccessBlockedUntilChoice",
      "page_access_blocked_until_choice"
    ]) === true ||
    getNestedBooleanEvidence(rawEvidence, ["hybridConsentSummary", "hybrid_consent_summary", "hybridUiSummary", "hybrid_ui_summary"], [
      "cookieWallDetected",
      "cookie_wall_detected",
      "forcedActionRequired",
      "forced_action_required",
      "pageInteractionBlocked",
      "page_interaction_blocked"
    ]) === true;

  return Boolean(
    materialBlock &&
      (
        isNonConsentBlockingOverlayKind(overlayKind) ||
        hasConsentSpecificOverlayEvidence(rawEvidence) ||
        /bot_challenge_blocking_scan|login_or_paywall_blocking_scan|consent_overlay_blocking_scan|age_gate_blocking_scan/i.test(overlayKind ?? "")
      )
  );
}

function hasConcreteDarkPatternChildEvidence(rawEvidence: Record<string, unknown> | null | undefined) {
  if (hasNonConsentOverlayWithoutIndependentConsentEvidence(rawEvidence)) {
    return false;
  }

  if (hasVerifiedConsentUiEvidence(rawEvidence)) {
    return true;
  }

  const consentSurfaceGate = evaluateConsentSurfaceGate(rawEvidence);
  const flags = getStringArrayValues(rawEvidence, ["flags", "evidenceFlags", "uiEvidenceFlags"]);
  return (
    consentSurfaceGate.consentSurfaceObserved &&
    consentSurfaceGate.rejectAbsentFirstLayer &&
    consentSurfaceGate.preChoiceState &&
    !consentSurfaceGate.hasExplicitPromotionSuppressor &&
    flags.some((flag) =>
      /privacy\.dark_pattern_(?:accept_button_prominence|forced_consent_wall|reject_button_missing)|accept_more_prominent|forced_consent_wall|reject_button_missing/i.test(flag)
    )
  );
}

function hasConfirmedRejectTimingEvidence(rawEvidence: Record<string, unknown> | null | undefined) {
  const suppressionChecks = getObjectEvidence(rawEvidence, ["suppressionChecks", "suppression_checks"]);
  const rejectPath = getObjectEvidence(rawEvidence, [
    "rejectPathDepthAndAvailability",
    "reject_path_depth_and_availability"
  ]);
  if (!hasCredibleRejectInteractionAttribution(rawEvidence) && suppressionChecks?.reject_click_confirmed !== true) {
    return false;
  }
  const rejectSucceeded =
    rejectPath?.rejectInteractionSucceeded === true ||
    rejectPath?.reject_interaction_succeeded === true ||
    suppressionChecks?.reject_click_confirmed === true ||
    getBooleanEvidence(rawEvidence, ["consentRejectInteractionSucceeded", "consent_reject_interaction_succeeded"]) === true;
  if (!rejectSucceeded) {
    return false;
  }
  if (suppressionChecks && suppressionChecks.post_reject_window_available !== true) {
    return false;
  }

  const rawRows =
    rawEvidence?.postRejectNonEssentialRequests ??
    rawEvidence?.post_reject_non_essential_requests ??
    rawEvidence?.consent_reject_post_reject_non_essential_requests;
  const rows = Array.isArray(rawRows)
    ? rawRows.flatMap((entry): Array<Record<string, unknown>> => {
        if (entry && typeof entry === "object" && !Array.isArray(entry)) {
          return [entry as Record<string, unknown>];
        }
        if (typeof entry !== "string" || entry.trim().length === 0) {
          return [];
        }
        try {
          const parsed = JSON.parse(entry) as unknown;
          return parsed && typeof parsed === "object" && !Array.isArray(parsed)
            ? [parsed as Record<string, unknown>]
            : [];
        } catch {
          return [];
        }
      })
    : [];
  if (rows.length === 0) {
    return false;
  }

  return rows.some((row) => {
    const category = typeof row.category === "string" ? row.category : "";
    const url =
      typeof row.url === "string"
        ? row.url
        : typeof row.requestUrl === "string"
          ? row.requestUrl
          : typeof row.request_url === "string"
            ? row.request_url
            : "";
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
}

function getRejectInteractionAttribution(rawEvidence: Record<string, unknown> | null | undefined) {
  return getObjectEvidence(rawEvidence, ["rejectInteractionAttribution", "reject_interaction_attribution"]);
}

function getRejectInteractionLabel(rawEvidence: Record<string, unknown> | null | undefined) {
  const attribution = getRejectInteractionAttribution(rawEvidence);
  return getFirstString(attribution, ["clickedLabel", "clicked_label", "clickedText", "clicked_text", "controlText", "control_text"]);
}

function hasCredibleRejectInteractionAttribution(rawEvidence: Record<string, unknown> | null | undefined) {
  const attribution = getRejectInteractionAttribution(rawEvidence);
  if (!attribution) {
    return true;
  }

  if (attribution.finalUrlHostChanged === true || attribution.final_url_host_changed === true) {
    return false;
  }

  const label = getRejectInteractionLabel(rawEvidence);
  const controlRole = getFirstString(attribution, ["controlRole", "control_role"]);
  const controlSource = getFirstString(attribution, ["controlSource", "control_source"]);
  const consentSurfaceDetected =
    attribution.consentSurfaceDetected === true ||
    attribution.consent_surface_detected === true ||
    /cmp_|consent|cookie|privacy/i.test(controlSource ?? "");
  if (!label) {
    return consentSurfaceDetected && controlRole
      ? /^(reject|toggle|save)$/i.test(controlRole)
      : true;
  }

  const classification = classifyConsentControlLabel({
    label,
    hasConsentContext: true,
    hasPreferenceContext: true,
  });
  if (classification.intent === "reject" && classification.confidence >= 0.5) {
    return true;
  }

  return consentSurfaceDetected && /^(reject|toggle|save)$/i.test(controlRole ?? "");
}

function getThirdPartyAddedAfterRejectCookieCount(rawEvidence: Record<string, unknown> | null | undefined) {
  const provenance = getObjectEvidence(rawEvidence, [
    "rejectCookieDiffProvenance",
    "reject_cookie_diff_provenance",
    "consentRejectCookieDiffProvenance",
    "consent_reject_cookie_diff_provenance"
  ]);
  const summary = getObjectEvidence(provenance, ["summary"]);
  const explicit =
    getNumberEvidence(summary, ["thirdPartyAddedAfterRejectCount", "third_party_added_after_reject_count"]) ??
    getNumberEvidence(summary, ["thirdPartyPersistedAfterRejectCount", "third_party_persisted_after_reject_count"]);
  if (explicit !== null) {
    return explicit;
  }

  return getObjectArrayEvidence(provenance, ["changedCookies", "changed_cookies"]).filter((row) => {
    const firstPartyStatus = getFirstString(row, ["firstPartyStatus", "first_party_status"]);
    const change = getFirstString(row, ["change"]);
    return firstPartyStatus === "third_party" && (change === "added_after_reject" || change === "persisted_after_reject");
  }).length;
}

function hasStrongPostRejectTrackerVendorEvidence(rawEvidence: Record<string, unknown> | null | undefined) {
  const suppressionChecks = getObjectEvidence(rawEvidence, ["suppressionChecks", "suppression_checks"]);
  const rejectPath = getObjectEvidence(rawEvidence, [
    "rejectPathDepthAndAvailability",
    "reject_path_depth_and_availability"
  ]);
  if (!hasCredibleRejectInteractionAttribution(rawEvidence) && suppressionChecks?.reject_click_confirmed !== true) {
    return false;
  }
  const rejectSucceeded =
    rejectPath?.rejectInteractionSucceeded === true ||
    rejectPath?.reject_interaction_succeeded === true ||
    getBooleanEvidence(rawEvidence, ["consentRejectInteractionSucceeded", "consent_reject_interaction_succeeded"]) === true ||
    suppressionChecks?.reject_click_confirmed === true;

  if (!rejectSucceeded) {
    return false;
  }
  if (
    suppressionChecks?.cmp_initialization_only === true ||
    suppressionChecks?.navigation_or_reload_ambiguous === true ||
    suppressionChecks?.baseline_contradiction_detected === true
  ) {
    return false;
  }

  const postRejectEvidenceUrls = getStringArrayValues(rawEvidence, [
    "consentPostRejectTrackerEvidenceUrls",
    "consent_post_reject_tracker_evidence_urls",
    "runtimeRequestUrls",
    "runtime_request_urls",
    "runtimeEvidenceUrls",
    "runtime_evidence_urls"
  ]);
  const postRejectRowEvidenceUrls = getObjectArrayEvidence(rawEvidence, [
    "postRejectNonEssentialRequests",
    "post_reject_non_essential_requests",
    "consentRejectPostRejectNonEssentialRequests",
    "consent_reject_post_reject_non_essential_requests"
  ]).flatMap((row) =>
    getFirstString(row, ["url", "requestUrl", "request_url", "urlSample", "url_sample"]) ?? []
  );
  const postRejectEvidenceUrlCount = uniqueStrings([
    ...postRejectEvidenceUrls,
    ...postRejectRowEvidenceUrls
  ]).filter((url) => /^https?:\/\//i.test(url)).length;
  const thirdPartyCookiesAddedAfterReject = getThirdPartyAddedAfterRejectCookieCount(rawEvidence);
  const namedTrackerVendors = getStringArrayValues(rawEvidence, [
    "persisted_tracker_vendors",
    "post_reject_tracker_vendors",
    "runtimeVendors",
    "runtime_vendors"
  ]).filter((vendor) =>
    /adobe|ads|analytics|clarity|doubleclick|facebook|google|gtm|hubspot|linkedin|marketo|meta|munchkin|pixel|reddit|tiktok/i.test(vendor)
  );

  return (
    namedTrackerVendors.length > 0 &&
    (postRejectEvidenceUrlCount >= 5 || (postRejectEvidenceUrlCount >= 3 && thirdPartyCookiesAddedAfterReject >= 3))
  );
}

function hasSensitiveSessionReplayCorrelationLabel(rawEvidence: Record<string, unknown> | null | undefined) {
  return getObjectArrayEvidence(rawEvidence, ["sensitivePayloadViolations", "sensitive_payload_violations"]).some((row) =>
    getFirstString(row, ["evidenceSource", "evidence_source"]) === "sensitive_field_session_replay_correlation"
  );
}

function isRetargetingConcern(
  concern: Pick<NormalizedConcern, "canonicalConcernKey" | "suggestedUnifiedFindingId" | "originKey" | "title">
) {
  const haystack = [
    concern.canonicalConcernKey,
    concern.suggestedUnifiedFindingId,
    concern.originKey,
    concern.title
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return /retargeting_pixel|retargeting pixel|retargeting_pixel_observed/.test(haystack);
}

function isCrossDomainIdentifierSharingConcern(
  concern: Pick<NormalizedConcern, "suggestedUnifiedFindingId">
) {
  return concern.suggestedUnifiedFindingId === "cross_domain_identifier_sharing_observed";
}

function isVideoContentTrackingConcern(
  concern: Pick<NormalizedConcern, "canonicalConcernKey" | "suggestedUnifiedFindingId" | "originKey" | "title">
) {
  const haystack = [
    concern.canonicalConcernKey,
    concern.suggestedUnifiedFindingId,
    concern.originKey,
    concern.title
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return /video_content_tracking_exposure|video content tracking|video privacy/.test(haystack);
}

function isFingerprintingConcern(
  concern: Pick<NormalizedConcern, "canonicalConcernKey" | "suggestedUnifiedFindingId" | "originKey" | "title">
) {
  const haystack = [
    concern.canonicalConcernKey,
    concern.suggestedUnifiedFindingId,
    concern.originKey,
    concern.title
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return /fingerprinting|fingerprint/.test(haystack);
}

function isContradictionConcern(
  concern: Pick<NormalizedConcern, "canonicalConcernKey" | "suggestedUnifiedFindingId" | "originKey" | "title">
) {
  if (isSurfaceIntegrityConcern(concern) || isDisclosurePlacementConcern(concern)) {
    return false;
  }

  const haystack = [
    concern.canonicalConcernKey,
    concern.suggestedUnifiedFindingId,
    concern.originKey,
    concern.title
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return /conflict|mismatch|contradiction|functional_misalignment|missing_technical_disclosure|session_replay_undisclosed/.test(
    haystack
  );
}

function isSurfaceIntegrityConcern(
  concern: Pick<NormalizedConcern, "suggestedUnifiedFindingId">
) {
  return concern.suggestedUnifiedFindingId === "surface_title_mismatch";
}

function isDisclosurePlacementConcern(
  concern: Pick<NormalizedConcern, "suggestedUnifiedFindingId">
) {
  return concern.suggestedUnifiedFindingId === "affiliate_disclosure_scope_limited";
}

function isLowConfidencePolicyExtractionConcern(
  concern: Pick<NormalizedConcern, "suggestedUnifiedFindingId">
) {
  return concern.suggestedUnifiedFindingId === "low_confidence_policy_extraction";
}

function isConsentSurfaceMissingConcern(
  concern: Pick<NormalizedConcern, "suggestedUnifiedFindingId">
) {
  return concern.suggestedUnifiedFindingId === "consent_surface_missing";
}

function isWeakCookieSecurityAttributesConcern(
  concern: Pick<NormalizedConcern, "suggestedUnifiedFindingId">
) {
  return concern.suggestedUnifiedFindingId === "weak_cookie_security_attributes";
}

function isAccessibilitySupportPathMissingConcern(
  concern: Pick<NormalizedConcern, "suggestedUnifiedFindingId">
) {
  return concern.suggestedUnifiedFindingId === "accessibility_support_path_missing";
}

function isSaleSharingControlsMissingConcern(
  concern: Pick<NormalizedConcern, "suggestedUnifiedFindingId">
) {
  return concern.suggestedUnifiedFindingId === "sale_sharing_controls_missing";
}

function isCcpaCpraDeferredConcern(
  concern: Pick<NormalizedConcern, "suggestedUnifiedFindingId">
) {
  return concern.suggestedUnifiedFindingId === "sale_sharing_controls_missing" ||
    concern.suggestedUnifiedFindingId === "do_not_sell_sharing_disclosure_conflict";
}

function isBlockingOverlayConcern(
  concern: Pick<NormalizedConcern, "suggestedUnifiedFindingId">
) {
  return concern.suggestedUnifiedFindingId === "blocking_overlay_observed";
}

function isConsentDarkPatternConcern(
  concern: Pick<NormalizedConcern, "canonicalConcernKey" | "originKey" | "suggestedUnifiedFindingId" | "title">
) {
  const haystack = [
    concern.canonicalConcernKey,
    concern.originKey,
    concern.suggestedUnifiedFindingId,
    concern.title
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return /consent_dark_patterns_detected|consent_control_not_reopenable|privacy_settings_control_not_observed|asymmetric_consent_ui|accept_more_prominent_than_reject|accept_button_prominence|accept action more prominent/.test(haystack);
}

function isConsentControlLifecycleConcern(
  concern: Pick<NormalizedConcern, "canonicalConcernKey" | "originKey" | "suggestedUnifiedFindingId" | "title">
) {
  const haystack = [
    concern.canonicalConcernKey,
    concern.originKey,
    concern.suggestedUnifiedFindingId,
    concern.title
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return /consent_control_not_reopenable|privacy_settings_control_not_observed|cookie_preferences_link_not_observed|withdrawal_control_not_observed|cmp_reopen_control_not_observed/.test(haystack);
}

function isConsentGovernanceDisclosureConcern(
  concern: Pick<NormalizedConcern, "canonicalConcernKey" | "originKey" | "suggestedUnifiedFindingId" | "title">
) {
  const haystack = [
    concern.canonicalConcernKey,
    concern.originKey,
    concern.suggestedUnifiedFindingId,
    concern.title
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return /consent_governance_disclosure_gap|consent preferences and withdrawal process not clearly explained/.test(haystack);
}

function isForcedConsentInteractionConcern(
  concern: Pick<NormalizedConcern, "canonicalConcernKey" | "originKey" | "suggestedUnifiedFindingId" | "title">
) {
  const haystack = [
    concern.canonicalConcernKey,
    concern.originKey,
    concern.suggestedUnifiedFindingId,
    concern.title
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return /forced_consent_interaction|forced_consent_wall|forced consent interaction/.test(haystack);
}

function isAccessibilityIssueFindingConcern(
  concern: Pick<NormalizedConcern, "suggestedUnifiedFindingId">
) {
  return ACCESSIBILITY_PAGE_ATTRIBUTION_IDS.has(concern.suggestedUnifiedFindingId ?? "");
}

function isSplitAccessibilityIssueConcern(
  concern: Pick<NormalizedConcern, "suggestedUnifiedFindingId">
) {
  return [
    "keyboard_navigation_accessibility_issue",
    "semantic_labeling_accessibility_issue",
    "text_alternative_accessibility_issue",
    "visual_contrast_accessibility_issue"
  ].includes(concern.suggestedUnifiedFindingId ?? "");
}

function isFocusManagementIssueConcern(
  concern: Pick<NormalizedConcern, "suggestedUnifiedFindingId">
) {
  return concern.suggestedUnifiedFindingId === "focus_management_issue";
}

function isBoundedKeyPageDiscoveryUnresolvedConcern(
  concern: Pick<NormalizedConcern, "suggestedUnifiedFindingId">
) {
  return concern.suggestedUnifiedFindingId === "bounded_key_page_discovery_unresolved";
}

function isCoverageGapSurfaceMissingConcern(
  concern: Pick<NormalizedConcern, "suggestedUnifiedFindingId">
) {
  return COVERAGE_GAP_SURFACE_MISSING_IDS.has(concern.suggestedUnifiedFindingId ?? "");
}

function isCoverageGapUnavailableConcern(
  concern: Pick<NormalizedConcern, "suggestedUnifiedFindingId">
) {
  return [
    "privacy_policy_unavailable",
    "terms_unavailable",
    "cookie_policy_unavailable",
    "accessibility_statement_unavailable",
    "contact_page_unavailable"
  ].includes(concern.suggestedUnifiedFindingId ?? "");
}

function isCanonicalPolicyPageType(value: NormalizedConcernPolicyPageType) {
  return value === "privacy_policy" || value === "cookie_policy" || value === "terms_of_service";
}

function normalizeConcernPolicyPageType(value: unknown): NormalizedConcernPolicyPageType {
  switch (value) {
    case "privacy_policy":
    case "cookie_policy":
    case "terms_of_service":
    case "accessibility_statement":
    case "contact_page":
    case "non_policy":
      return value;
    default:
      return null;
  }
}

function getConcernPolicyPrimarySource(
  concern: Pick<NormalizedConcern, "policyIsPrimarySource">,
  rawEvidence: Record<string, unknown> | null | undefined
) {
  const explicit = derivePolicyPrimarySourceFromEvidence(rawEvidence);

  return explicit ?? concern.policyIsPrimarySource ?? null;
}

function getConcernPolicyPageType(
  concern: Pick<NormalizedConcern, "policyPageType">,
  rawEvidence: Record<string, unknown> | null | undefined
) {
  const explicit = normalizeConcernPolicyPageType(derivePolicyPageTypeFromEvidence(rawEvidence));

  return explicit ?? concern.policyPageType ?? null;
}

function hasConcreteConsentSurfaceAbsenceEvidence(rawEvidence: Record<string, unknown> | null | undefined) {
  if (!rawEvidence) {
    return false;
  }

  const explicitNoSurface =
    rawEvidence.consentSurfaceObserved === false ||
    rawEvidence.consent_surface_observed === false ||
    rawEvidence.cookieBannerPresent === false ||
    rawEvidence.consentBannerPresent === false;
  const noMechanismDeclared =
    rawEvidence.consentMechanismType === "none" || rawEvidence.consent_mechanism_type === "none";
  const noCmpDeclared = rawEvidence.cmpVendorName === null || rawEvidence.cmp_vendor_name === null;
  const noInteractionModel =
    rawEvidence.consentInteractionModel === "none" || rawEvidence.consent_interaction_model === "none";

  const corroboratingSignals = [noMechanismDeclared, noCmpDeclared, noInteractionModel].filter(Boolean).length;
  return explicitNoSurface && corroboratingSignals >= 1;
}

function isSecuritySensitiveCookieName(value: string) {
  return /auth|session|sess|sid|token|jwt|csrf|xsrf|login|account|user|customer|checkout|cart|payment|pay|billing/i.test(value);
}

function getWeakCookieAttributeNames(summary: Record<string, unknown>) {
  return [
    ...getStringArrayValues(summary, ["missingSecureCookieNames", "missing_secure_cookie_names"]),
    ...getStringArrayValues(summary, ["missingHttpOnlyCookieNames", "missing_http_only_cookie_names"]),
    ...getStringArrayValues(summary, ["weakSameSiteCookieNames", "weak_same_site_cookie_names"]),
    ...getStringArrayValues(summary, [
      "thirdPartyWeakAttributeCookieNames",
      "third_party_weak_attribute_cookie_names"
    ])
  ];
}

function hasPromotableWeakCookieAttributeEvidence(rawEvidence: Record<string, unknown> | null | undefined) {
  const summary =
    rawEvidence?.cookieAttributeSummary && typeof rawEvidence.cookieAttributeSummary === "object"
      ? (rawEvidence.cookieAttributeSummary as Record<string, unknown>)
      : rawEvidence ?? null;
  if (!summary) {
    return false;
  }

  const missingSecureCount = getNumberEvidence(summary, ["missingSecureCount", "missing_secure_count"]) ?? 0;
  const missingHttpOnlyCount = getNumberEvidence(summary, ["missingHttpOnlyCount", "missing_http_only_count"]) ?? 0;
  const weakSameSiteCount = getNumberEvidence(summary, ["weakSameSiteCount", "weak_same_site_count"]) ?? 0;
  const thirdPartyWeakCount =
    getNumberEvidence(summary, ["thirdPartyWeakAttributeCount", "third_party_weak_attribute_count"]) ?? 0;
  const weakCookieNames = [...new Set(getWeakCookieAttributeNames(summary))];
  const hasConcreteAttributes = missingSecureCount + missingHttpOnlyCount + weakSameSiteCount + thirdPartyWeakCount > 0;
  if (!hasConcreteAttributes || weakCookieNames.length === 0) {
    return false;
  }

  if (weakCookieNames.some(isSecuritySensitiveCookieName)) {
    return true;
  }

  if (weakCookieNames.length >= 3 && (missingSecureCount + weakSameSiteCount + thirdPartyWeakCount) >= 3) {
    return true;
  }

  return false;
}

function hasMeaningfulGpcIgnoredEvidence(rawEvidence: Record<string, unknown> | null | undefined) {
  if (!rawEvidence) {
    return false;
  }

  const trackerCountDelta = getNumberEvidence(rawEvidence, ["trackerCountDelta", "tracker_count_delta"]) ?? 0;
  const thirdPartyCookieCountDelta =
    getNumberEvidence(rawEvidence, ["thirdPartyCookieCountDelta", "third_party_cookie_count_delta"]) ?? 0;
  const hasMeaningfulDelta = trackerCountDelta !== 0 || thirdPartyCookieCountDelta !== 0;

  if (!hasMeaningfulDelta) {
    return false;
  }

  const hasReviewerVisibleSupport =
    hasSubstantivePageOrSnippetEvidence(rawEvidence) ||
    getBooleanEvidence(rawEvidence, ["gpcDisclosurePresent", "gpc_disclosure_present"]) === true ||
    getStringArrayValues(rawEvidence, ["policyMentions", "policy_mentions"]).some((value) =>
      /gpc|global privacy control|opt-?out preference/i.test(value)
    );

  return hasReviewerVisibleSupport;
}

function hasSubstantivePageOrSnippetEvidence(rawEvidence: Record<string, unknown> | null | undefined) {
  return (
    getEvidenceUrlCandidates(rawEvidence).length > 0 ||
    getEvidenceTextCandidates(rawEvidence).some(hasMeaningfulReviewerSnippet)
  );
}

function isCommercialEvidenceConcern(
  concern: Pick<NormalizedConcern, "suggestedUnifiedFindingId">
) {
  return [
    "discount_claim_present",
    "original_price_comparison_present",
    "limited_time_pressure",
    "restrictive_termination_or_suspension_terms",
    "store_credit_only_remedy",
    "cancellation_method_disclosure_missing"
  ].includes(concern.suggestedUnifiedFindingId ?? "");
}

const DERIVATIVES_LANGUAGE_SIGNAL_KEYS = new Set([
  "financial.options_or_futures_language_present",
  "financial.perpetuals_or_derivatives_language_present"
]);

function isDerivativesLanguageSignal(
  concern: Pick<NormalizedConcern, "originKey" | "signalKey">
) {
  return (
    DERIVATIVES_LANGUAGE_SIGNAL_KEYS.has(concern.originKey) ||
    (typeof concern.signalKey === "string" && DERIVATIVES_LANGUAGE_SIGNAL_KEYS.has(concern.signalKey))
  );
}

const SPORTSBOOK_GAMBLING_CONTEXT_PATTERN =
  /\b(?:sportsbook|sports\s+betting|online\s+betting|betting\s+site|casino|online\s+casino|gambling|gaming|wager|wagering|fantasy\s+sports|daily\s+fantasy|draftkings|fanduel|betmgm|caesars|pointsbet|bet365|unibet|parlay|player\s+prop|prop\s+bet|moneyline|over\/under|spread\s+betting)\b/i;

const SPORTS_FUTURES_AND_OPTIONS_PATTERN =
  /\b(?:nfl|nba|mlb|nhl|super\s+bowl|ncaa|premier\s+league)\b.{0,60}\b(?:futures\s+odds|futures\s+betting|betting\s+options|parlay\s+options|prop\s+markets)\b|\bbetting\s+options\b|\bparlay\s+options\b|\bplayer\s+prop\s+markets\b|\bfutures\s+odds\b/i;

function hasSportsbookGamblingContext(rawEvidence: Record<string, unknown> | null | undefined) {
  if (!rawEvidence) {
    return false;
  }

  const reviewerVisibleText = [
    ...getEvidenceTextCandidates(rawEvidence),
    ...getEvidenceUrlCandidates(rawEvidence)
  ].join(" ");

  return (
    SPORTSBOOK_GAMBLING_CONTEXT_PATTERN.test(reviewerVisibleText) ||
    SPORTS_FUTURES_AND_OPTIONS_PATTERN.test(reviewerVisibleText)
  );
}

const TRUE_FINANCIAL_DERIVATIVES_CONTEXT_PATTERN =
  /\b(?:options?\s+contract|call\s+option|put\s+option|strike\s+price|strike|expir(?:y|ation\s+date)|maturity|futures?\s+contract|commodities?\s+futures|equity\s+options|index\s+futures|perpetual\s+swap|perps|derivatives?\s+exchange|derivatives?\s+market|underlying\s+(?:asset|security)|hedg(?:e|ing)|liquidat(?:e|ion)|order\s+book|limit\s+order|market\s+order|cfd|contract\s+for\s+difference)\b/i;

function hasTrueFinancialDerivativesContext(rawEvidence: Record<string, unknown> | null | undefined) {
  if (!rawEvidence) {
    return false;
  }

  const reviewerVisibleText = [
    ...getEvidenceTextCandidates(rawEvidence),
    ...getEvidenceUrlCandidates(rawEvidence)
  ].join(" ");

  return TRUE_FINANCIAL_DERIVATIVES_CONTEXT_PATTERN.test(reviewerVisibleText);
}

const PREDICTION_MARKET_CONTEXT_PATTERN =
  /\b(?:event\s+contracts?\b|prediction\s+market\s+(?:exchange|platform)|trade\s+outcomes?\b|economic\s+event\s+contract|political\s+event\s+contract)\b/i;

const PREDICTION_MARKET_REGULATORY_PATTERN =
  /\b(?:CFTC|Commodity\s+Futures\s+Trading\s+Commission|Designated\s+Contract\s+Market|DCM|NFA|National\s+Futures\s+Association)\b/i;

function hasPredictionMarketContext(rawEvidence: Record<string, unknown> | null | undefined) {
  if (!rawEvidence) {
    return false;
  }

  const reviewerVisibleText = [
    ...getEvidenceTextCandidates(rawEvidence),
    ...getEvidenceUrlCandidates(rawEvidence)
  ].join(" ");

  return (
    PREDICTION_MARKET_CONTEXT_PATTERN.test(reviewerVisibleText) ||
    PREDICTION_MARKET_REGULATORY_PATTERN.test(reviewerVisibleText)
  );
}

function hasConcreteOfferEvidence(rawEvidence: Record<string, unknown> | null | undefined) {
  if (!rawEvidence) {
    return false;
  }

  const offerSnippets = rawEvidence.offerSnippets;
  if (Array.isArray(offerSnippets) && offerSnippets.some((entry) => typeof entry === "string" && entry.trim().length > 0)) {
    return true;
  }

  const primaryOfferSnippet = rawEvidence.primaryOfferSnippet;
  if (typeof primaryOfferSnippet === "string" && primaryOfferSnippet.trim().length > 0) {
    return true;
  }

  return false;
}

const NEGATIVE_FINANCIAL_PROMOTION_FINDING_IDS = new Set([
  "financial_urgency_pressure_tactic_detected",
  "performance_claims_without_context",
  "guaranteed_or_high_return_claims_present",
  "investment_risk_disclosure_missing",
  "hypothetical_performance_disclosure_missing",
  "testimonial_endorsement_financial_promotion_risk",
  "investment_purchase_by_credit_card_present",
  "investment_urgency_countdown_present",
  "pump_and_dump_language_present",
  "vague_whitepaper_or_technical_obfuscation_present",
  "registration_identifier_missing",
  "registration_claim_support_missing",
  "entity_naming_consistency_conflict",
  "fee_disclosure_missing_or_opaque",
  "material_terms_hard_to_locate",
  "promo_to_terms_conflict",
  "yield_or_return_claims_high_risk",
  "high_risk_product_risk_disclosure_missing",
  "simulated_performance_without_disclosure",
  "unqualified_superlative_claim_detected"
]);

function isNegativeFinancialPromotionConcern(
  concern: Pick<NormalizedConcern, "suggestedUnifiedFindingId">
) {
  return NEGATIVE_FINANCIAL_PROMOTION_FINDING_IDS.has(concern.suggestedUnifiedFindingId ?? "");
}

function isUnmappedFinancialSignalConcern(
  concern: Pick<NormalizedConcern, "originKey" | "suggestedUnifiedFindingId">
) {
  return !concern.suggestedUnifiedFindingId && /^financial\./.test(concern.originKey);
}

const EXPLICIT_FINANCIAL_OFFER_PATTERN =
  /(?:\binvest(?:ment|ing|or)?\b|trading\s+(?:signals?|system|platform|strategy|bot)|(?:subscribe|join|sign\s*up|open)\s+(?:an?\s+)?(?:account|plan|membership)|pricing|checkout|margin|leverage|leveraged|derivative|perpetual|options?\s+trading|trade\s+options?|trading\s+options?|futures?\s+trading|trade\s+futures?|copy\s+trading|staking\s+(?:apy|yield)|\bapy\b|forex|cfd|crypto\s+(?:trading|yield|staking)|brokerage\s+account|sportsbook|sports\s+betting|bonus\s+bets?|wager(?:ing)?|casino|gambl(?:e|ing))/i;

const NON_FINANCIAL_EDITORIAL_OR_RETAIL_PATTERN =
  /(?:\b(?:lineup|festival|concert|album|movie|sports|election|celebrity|weather|recipe|travel|retail|ecommerce|e-commerce|bookstore|bookseller|bookshop|used\s+books?|rare\s+books?|textbooks?|paperbacks?|hardcovers?)\b|(?:\b\d{1,2}%\s+off\b)|(?:\bselling\b.{0,80}\b(?:books?|textbooks?|serum|makeup|shoes|clothing|furniture|kitchen|mattress|headphones|deals?)\b)|(?:\bamazon\b.{0,80}\b(?:selling|deal|deals?|off)\b))/i;

function hasNonFinancialEditorialOrRetailContext(rawEvidence: Record<string, unknown> | null | undefined) {
  const reviewerVisibleText = [
    ...getEvidenceTextCandidates(rawEvidence),
    ...getEvidenceUrlCandidates(rawEvidence)
  ].join(" ");

  return NON_FINANCIAL_EDITORIAL_OR_RETAIL_PATTERN.test(reviewerVisibleText);
}

function hasExplicitFinancialOfferInEvidence(rawEvidence: Record<string, unknown> | null | undefined): boolean {
  const reviewerVisibleText = [
    ...getEvidenceTextCandidates(rawEvidence),
    ...getEvidenceUrlCandidates(rawEvidence)
  ].join(" ");
  return EXPLICIT_FINANCIAL_OFFER_PATTERN.test(reviewerVisibleText);
}

function hasLegacyFinancialPageHeuristics(rawEvidence: Record<string, unknown> | null | undefined): boolean {
  const pageClassification = getFirstString(rawEvidence, [
    "pageClassification",
    "page_classification"
  ]);
  if (
    pageClassification &&
    /financial_offer|pricing_or_fees|investment|trading|brokerage|loan|credit|banking|crypto/i.test(pageClassification)
  ) {
    return true;
  }

  const pageType = getFirstString(rawEvidence, ["pageType", "page_type"]);
  if (
    pageType &&
    /financial|offer|pricing|checkout|trading|brokerage|investment|loan|credit|banking|crypto|account/i.test(pageType)
  ) {
    return true;
  }

  return false;
}

function hasFinancialOfferContext(rawEvidence: Record<string, unknown> | null | undefined) {
  if (!rawEvidence) {
    return false;
  }

  const domainIndustryPrimary = getFirstString(rawEvidence, [
    "domainIndustryPrimary",
    "domain_industry_primary"
  ]);
  const normalizedDomainIndustryPrimary = domainIndustryPrimary?.toLowerCase().replace(/[\s_-]+/g, "_") ?? null;

  // Explicit finance/crypto domain → always treat as financial context
  if (normalizedDomainIndustryPrimary === "finance" || normalizedDomainIndustryPrimary === "crypto") {
    return true;
  }

  if (
    normalizedDomainIndustryPrimary &&
    /^(?:retail|ecommerce|e_commerce|books?|bookstore|bookseller|bookshop)$/.test(normalizedDomainIndustryPrimary)
  ) {
    return hasExplicitFinancialOfferInEvidence(rawEvidence);
  }

  // Explicit investor/securities promotion flag → always treat as financial context
  const investorOrSecuritiesPromotion = getBooleanEvidence(rawEvidence, [
    "investorOrSecuritiesPromotion",
    "investor_or_securities_promotion"
  ]);
  if (investorOrSecuritiesPromotion === true) {
    return true;
  }

  // No substantive page or snippet evidence → no financial context
  if (!hasSubstantivePageOrSnippetEvidence(rawEvidence)) {
    return false;
  }

  const hasExplicitFinancialOffer = hasExplicitFinancialOfferInEvidence(rawEvidence);

  // Non-financial editorial or retail context without explicit offer → no financial context
  if (hasNonFinancialEditorialOrRetailContext(rawEvidence) && !hasExplicitFinancialOffer) {
    return false;
  }

  // When the domain is explicitly classified as non-finance, do not trust
  // page-level heuristics (classification / type) alone. Require explicit
  // financial offer language in the evidence text.
  if (normalizedDomainIndustryPrimary !== null && normalizedDomainIndustryPrimary !== "") {
    return hasExplicitFinancialOffer;
  }

  // No domain classification: fall back to legacy page-level heuristics
  if (hasLegacyFinancialPageHeuristics(rawEvidence)) {
    return true;
  }

  return hasExplicitFinancialOffer;
}

function hasClearPricingTermsContext(rawEvidence: Record<string, unknown> | null | undefined) {
  if (!rawEvidence || !hasSubstantivePageOrSnippetEvidence(rawEvidence)) {
    return false;
  }

  const reviewerVisibleText = [
    ...getEvidenceTextCandidates(rawEvidence),
    ...getEvidenceUrlCandidates(rawEvidence)
  ].join(" ");
  const hasFeeClaim =
    /\b(?:fee|fees|pricing|price|cost|monthly|annual|subscription|subscribe|membership|trial|\$|usd)\b/i.test(
      reviewerVisibleText
    );
  const hasMaterialTerms = /refund|cancel|cancellation|renewal|billing|terms|fee schedule|withdrawal|conditions/i.test(
    reviewerVisibleText
  );

  return hasFeeClaim && hasMaterialTerms;
}

function hasRepresentativeAccessibilityExamples(rawEvidence: Record<string, unknown> | null | undefined) {
  return hasExternallyPromotableAccessibilityExamples(rawEvidence);
}

function getNumberEvidence(
  evidence: Record<string, unknown> | null | undefined,
  keys: string[]
) {
  for (const key of keys) {
    if (typeof evidence?.[key] === "number" && Number.isFinite(evidence[key] as number)) {
      return evidence[key] as number;
    }
  }

  return null;
}

function getCoverageGapPresenceValue(
  concern: Pick<NormalizedConcern, "suggestedUnifiedFindingId">,
  rawEvidence: Record<string, unknown> | null | undefined
) {
  const keyMap: Partial<Record<NonNullable<typeof concern.suggestedUnifiedFindingId>, string[]>> = {
    accessibility_statement_missing_surface: ["accessibilityStatementPresent", "accessibility_statement_present"],
    contact_page_missing_surface: ["contactPagePresent", "contact_page_present"],
    cookie_policy_missing_surface: ["cookiePolicyPresent", "cookie_policy_present"],
    privacy_policy_missing_surface: ["privacyPolicyPresent", "privacy_policy_present"],
    terms_missing_surface: ["termsOfServicePresent", "terms_of_service_present"]
  };

  const keys = concern.suggestedUnifiedFindingId ? keyMap[concern.suggestedUnifiedFindingId] : null;
  return keys ? getBooleanEvidence(rawEvidence, keys) : null;
}

function hasStrongCoverageGapSurfaceMissingEvidence(
  concern: Pick<NormalizedConcern, "suggestedUnifiedFindingId">,
  input: {
    evidenceStrengthFlags: NormalizedConcernEvidenceStrengthFlag[];
    rawEvidence: Record<string, unknown> | null | undefined;
  }
) {
  const presenceValue = getCoverageGapPresenceValue(concern, input.rawEvidence);
  const attemptedUrls = Array.isArray(input.rawEvidence?.keyPageAttemptedUrls)
    ? input.rawEvidence.keyPageAttemptedUrls.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    : Array.isArray(input.rawEvidence?.attemptedUrls)
      ? input.rawEvidence.attemptedUrls.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
      : [];
  const attemptCount =
    getNumberEvidence(input.rawEvidence, ["keyPageAttemptCount", "key_page_attempt_count"]) ?? attemptedUrls.length;
  const representativeSampleCount =
    getNumberEvidence(input.rawEvidence, [
      "representativePageCount",
      "representative_page_count",
      "sitewideSurfaceSampleCount",
      "sitewide_surface_sample_count",
      "surfaceAbsentAcrossTemplatesCount",
      "surface_absent_across_templates_count"
    ]) ?? 0;
  const explicitAbsenceConfirmation =
    getBooleanEvidence(input.rawEvidence, [
      "surfaceMissingConfirmed",
      "surface_missing_confirmed",
      "navSurfaceAbsentConfirmed",
      "nav_surface_absent_confirmed",
      "legalNavSurfaceAbsentConfirmed",
      "legal_nav_surface_absent_confirmed",
      "footerSurfaceAbsentConfirmed",
      "footer_surface_absent_confirmed",
      "headerSurfaceAbsentConfirmed",
      "header_surface_absent_confirmed",
      "sitewideSurfaceMissingConfirmed",
      "sitewide_surface_missing_confirmed"
    ]) === true;
  const hasConcreteReviewerEvidence =
    input.evidenceStrengthFlags.includes("page_attributed") ||
    attemptedUrls.length > 0 ||
    getEvidenceUrlCandidates(input.rawEvidence).length > 0 ||
    (Array.isArray(input.rawEvidence?.policySnippets) && input.rawEvidence.policySnippets.length > 0);

  if (presenceValue !== false && !explicitAbsenceConfirmation) {
    return false;
  }

  if (!explicitAbsenceConfirmation && isWeakUnverifiedCoverageGapDiscovery(input.rawEvidence)) {
    return false;
  }

  return (
    explicitAbsenceConfirmation ||
    representativeSampleCount >= 2 ||
    (attemptCount >= 2 && hasStableLinkedDiscoveryPath(input.rawEvidence)) ||
    (attemptCount >= 2 && attemptedUrls.length > 0) ||
    (presenceValue === false && hasConcreteReviewerEvidence)
  );
}

function isWeakUnverifiedCoverageGapDiscovery(rawEvidence: Record<string, unknown> | null | undefined) {
  if (!rawEvidence) {
    return false;
  }

  if (isGuessedOnlyDiscovery(rawEvidence)) {
    return true;
  }

  const stopReason = getFirstString(rawEvidence, ["keyPageStopReason", "key_page_stop_reason", "stopReason", "stop_reason"]);
  const extractionOutcome = getFirstString(rawEvidence, [
    "keyPageExtractionOutcome",
    "key_page_extraction_outcome",
    "extractionOutcome",
    "extraction_outcome"
  ]);
  if (/guessed_only|not_attempted/i.test(`${stopReason ?? ""}\n${extractionOutcome ?? ""}`)) {
    return true;
  }

  const fetchOutcomes = getStringArrayValues(rawEvidence, [
    "keyPageFetchOutcome",
    "key_page_fetch_outcome",
    "keyPageFetchOutcomes",
    "key_page_fetch_outcomes",
    "fetchOutcome",
    "fetch_outcome",
    "fetchOutcomes",
    "fetch_outcomes"
  ]);
  if (
    fetchOutcomes.length > 0 &&
    fetchOutcomes.every((value) => /blocked|forbidden|not_attempted|fetch_failed|timeout|error/i.test(value))
  ) {
    return true;
  }

  const verifiedPublicSurfacesCount = getNumberEvidence(rawEvidence, [
    "verifiedPublicSurfacesCount",
    "verified_public_surfaces_count"
  ]);
  const coverageLevel = getFirstString(rawEvidence, ["coverageLevel", "coverage_level"]);
  return verifiedPublicSurfacesCount === 0 && /limited|blocked|partial/i.test(coverageLevel ?? "");
}

function hasExpectedLegalPageCoverage(rawEvidence: Record<string, unknown> | null | undefined) {
  if (!rawEvidence) {
    return false;
  }

  const pageCoverageCount = [
    getBooleanEvidence(rawEvidence, ["privacyPolicyPresent", "privacy_policy_present"]),
    getBooleanEvidence(rawEvidence, ["termsOfServicePresent", "terms_of_service_present"]),
    getBooleanEvidence(rawEvidence, ["contactPagePresent", "contact_page_present"]),
    getBooleanEvidence(rawEvidence, ["affiliateDisclosurePresent", "affiliate_disclosure_present"])
  ].filter((value) => value === true).length;

  return pageCoverageCount >= 3;
}

function hasStableLinkedDiscoveryPath(rawEvidence: Record<string, unknown> | null | undefined) {
  if (!rawEvidence) {
    return false;
  }

  const discoverySource =
    typeof rawEvidence.keyPageDiscoverySource === "string"
      ? rawEvidence.keyPageDiscoverySource
      : typeof rawEvidence.key_page_discovery_source === "string"
        ? rawEvidence.key_page_discovery_source
        : null;

  return ["footer_link", "header_link", "body_link", "legal_hub", "second_hop_legal_hub"].includes(discoverySource ?? "");
}

function isGdprTransparencyArticle13EvidenceConcern(rawEvidence: Record<string, unknown> | null | undefined) {
  const profile = getFirstString(rawEvidence, [
    "gdprTransparencyEvidenceProfile",
    "gdpr_transparency_evidence_profile"
  ]);
  const creditProfile = getFirstString(rawEvidence, [
    "productionCreditProfile",
    "production_credit_profile"
  ]);
  const provenance = getFirstString(rawEvidence, [
    "classifierProvenance",
    "classifier_provenance"
  ]);
  const approvedDeterministicEvidence =
    profile === "gdpr_transparency_multilingual_article13_v1" &&
    creditProfile === "gdpr_transparency_multilingual_article13_v1" &&
    provenance === "gdpr_transparency_topic_classifier.v1";
  const approvedModelReviewEvidence =
    rawEvidence?.gdprTransparencyModelReviewEvidence === true &&
    profile === "gdpr_transparency_mini_review_v1" &&
    creditProfile === "gdpr_transparency_mini_review_v1" &&
    provenance === "mini_policy_semantic_review.v2";

  return rawEvidence?.gdprTransparencyArticle13Evidence === true &&
    rawEvidence.productionCredit === true &&
    (approvedDeterministicEvidence || approvedModelReviewEvidence);
}

function isGdprTransparencyLegalFrameworkValidityConcern(
  rawEvidence: Record<string, unknown> | null | undefined
) {
  return rawEvidence?.gdprTransparencyLegalFrameworkValidityEvidence === true &&
    getBooleanEvidence(rawEvidence, [
      "staleLegalFrameworkReferenceObserved",
      "stale_legal_framework_reference_observed"
    ]) === true;
}

function getGdprTransparencyArticle13ChecklistEligibility(
  rawEvidence: Record<string, unknown> | null | undefined
): NormalizedConcernRegulatoryChecklistEligibility {
  if (!isGdprTransparencyArticle13EvidenceConcern(rawEvidence)) {
    return "none";
  }

  const state = getFirstString(rawEvidence, [
    "gdprTransparencyArticle13ConcernState",
    "gdpr_transparency_article13_concern_state"
  ]);
  if (state === "partial") {
    return "review_signal";
  }
  if (state !== "sufficient") {
    return "none";
  }

  const topic = getFirstString(rawEvidence, [
    "gdprTransparencyArticle13Topic",
    "gdpr_transparency_article13_topic"
  ]);
  return topic && GDPR_TRANSPARENCY_ARTICLE13_CHECKLIST_OBSERVED_TOPICS.has(topic)
    ? "observed"
    : "review_signal";
}

function isGuessedOnlyDiscovery(rawEvidence: Record<string, unknown> | null | undefined) {
  return rawEvidence?.keyPageGuessedOnly === true || rawEvidence?.key_page_guessed_only === true;
}

function getPolicyExtractionStatus(rawEvidence: Record<string, unknown> | null | undefined) {
  return getPolicySignalString(rawEvidence, "policyExtractionStatus");
}

function getPolicySemanticConfidence(rawEvidence: Record<string, unknown> | null | undefined) {
  return getPolicySignalNumber(rawEvidence, "policySemanticConfidence");
}

function getPolicyCoverageRatio(rawEvidence: Record<string, unknown> | null | undefined) {
  return getPolicySignalNumber(rawEvidence, "policyCoverageRatio");
}

function getPolicySnippetCount(rawEvidence: Record<string, unknown> | null | undefined) {
  return getPolicySignalNumber(rawEvidence, "policySnippetCount");
}

function hasStrongStructuredPolicyDisclosureGapEvidence(
  rawEvidence: Record<string, unknown> | null | undefined
) {
  const extractionStatus = getPolicyExtractionStatus(rawEvidence);
  const semanticConfidence = getPolicySemanticConfidence(rawEvidence);
  const coverageRatio = getPolicyCoverageRatio(rawEvidence);
  const snippetCount = getPolicySnippetCount(rawEvidence);

  return (
    extractionStatus === "fetched" &&
    typeof semanticConfidence === "number" &&
    semanticConfidence >= 0.6 &&
    ((typeof coverageRatio === "number" && coverageRatio >= 0.35) ||
      (typeof snippetCount === "number" && snippetCount >= 1))
  );
}

function getPolicyRightsSignals(rawEvidence: Record<string, unknown> | null | undefined) {
  return getPolicySignalStringArray(rawEvidence, "policyRightsSignals");
}

export function concernRequiresPageAttribution(
  concern: Pick<NormalizedConcern, "suggestedUnifiedFindingId">
) {
  const findingId = concern.suggestedUnifiedFindingId;
  if (!findingId) {
    return false;
  }

  return ACCESSIBILITY_PAGE_ATTRIBUTION_IDS.has(findingId);
}

export function isDomainLevelSensitiveContextFinding(unifiedFindingId: string) {
  return DOMAIN_LEVEL_SENSITIVE_CONTEXT_IDS.has(unifiedFindingId);
}

export function isDomainLevelChildrenDisclosureFinding(unifiedFindingId: string) {
  return DOMAIN_LEVEL_CHILDREN_DISCLOSURE_IDS.has(unifiedFindingId);
}

export function packetNeedsPageAttribution(input: {
  family: string | undefined;
  unifiedFindingId: string;
}) {
  return (
    (input.family === "consent_tracking" &&
      !["gpc_signal_not_honored", "weak_cookie_security_attributes", "consent_mechanism_absent", "consent_surface_missing"].includes(input.unifiedFindingId)) ||
    input.family === "contradiction" ||
    (input.family === "sensitive_data" &&
      !isDomainLevelSensitiveContextFinding(input.unifiedFindingId) &&
      !isDomainLevelChildrenDisclosureFinding(input.unifiedFindingId))
  );
}

export function deriveConcernPolicy(input: {
  concern: Pick<
    NormalizedConcern,
    | "canonicalConcernKey"
    | "originKey"
    | "originType"
    | "policyIsPrimarySource"
    | "policyPageType"
    | "suggestedUnifiedFindingId"
    | "title"
  >;
  evidenceStrengthFlags: NormalizedConcernEvidenceStrengthFlag[];
  rawEvidence?: Record<string, unknown> | null;
}): {
  allowedNarrativeTier: NormalizedConcernAssertionLevel;
  externalSurfacingEligibility: NormalizedConcernExternalSurfacingEligibility;
  negativeEvidenceFlags: NormalizedConcernNegativeEvidenceFlag[];
  promotionEligibility: NormalizedConcernPromotionEligibility;
  regulatoryChecklistEligibility?: NormalizedConcernRegulatoryChecklistEligibility;
} {
  const hasDirectRuntime = input.evidenceStrengthFlags.includes("direct_runtime");
  const hasPageAttribution = input.evidenceStrengthFlags.includes("page_attributed");
  const hasKeyPageDiscovery = input.evidenceStrengthFlags.includes("key_page_discovery");
  const negativeEvidenceFlags = new Set<NormalizedConcernNegativeEvidenceFlag>();

  const suggestedUnifiedFindingId = input.concern.suggestedUnifiedFindingId;
  if (suggestedUnifiedFindingId === "cookie_retention_lifetime_review_signal") {
    const review = evaluateCookieRetentionReview(input.rawEvidence);
    return {
      allowedNarrativeTier:
        review.disposition === "eligible" && review.confidence === "strong"
          ? "strong"
          : review.disposition === "suppress"
            ? "weak"
            : "moderate",
      externalSurfacingEligibility: review.disposition === "eligible" ? "eligible" : review.disposition,
      negativeEvidenceFlags: review.negativeEvidenceFlags as NormalizedConcernNegativeEvidenceFlag[],
      promotionEligibility:
        review.disposition === "eligible" ? "eligible" : review.disposition === "audit_only" ? "internal_only" : "blocked"
    };
  }
  if (suggestedUnifiedFindingId === "cookie_disclosure_gap") {
    const hasSubstantiveCookieGap =
      getBooleanEvidence(input.rawEvidence, ["disclosureMismatchExplained", "disclosure_mismatch_explained"]) === true &&
      getEvidenceUrlCandidates(input.rawEvidence).length > 0 &&
      getStringArrayValues(input.rawEvidence, [
        "unmatched_cookie_names",
        "unmatchedCookieNames",
        "runtime_cookie_names",
        "runtimeCookieNames"
      ]).some((name) => !/^(awsalbcors?|optanon|onetrust|cookieconsent)/i.test(name));
    return {
      allowedNarrativeTier: hasSubstantiveCookieGap ? "strong" : "moderate",
      externalSurfacingEligibility: hasSubstantiveCookieGap ? "eligible" : "suppress",
      negativeEvidenceFlags: hasSubstantiveCookieGap
        ? []
        : ["missing_policy_runtime_alignment_bridge"],
      promotionEligibility: hasSubstantiveCookieGap ? "eligible" : "blocked"
    };
  }
  if (suggestedUnifiedFindingId === "policy_behavior_conflict" || suggestedUnifiedFindingId === "policy_behavior_contradiction_detected") {
    const runtimeVendorDisclosureReview = evaluateRuntimeVendorDisclosureEvidence(input.rawEvidence, "policy_behavior_conflict");
    if (runtimeVendorDisclosureReview.disposition === "eligible") {
      return {
        allowedNarrativeTier: runtimeVendorDisclosureReview.confidence === "strong" ? "strong" : "moderate",
        externalSurfacingEligibility: "eligible",
        negativeEvidenceFlags: runtimeVendorDisclosureReview.negativeEvidenceFlags as NormalizedConcernNegativeEvidenceFlag[],
        promotionEligibility: "eligible"
      };
    }
    const contractDecision = evaluatePolicyBehaviorConflictContract(input.rawEvidence);
    if (contractDecision?.promotionEligibility === "eligible") {
      return {
        ...contractDecision,
        negativeEvidenceFlags: contractDecision.negativeEvidenceFlags as NormalizedConcernNegativeEvidenceFlag[]
      };
    }
  }
  if (suggestedUnifiedFindingId === "consent_infrastructure__cmp_load_order") {
    const firstClassifiedTrackerAtMs = getNumberEvidence(input.rawEvidence, ["firstClassifiedTrackerAtMs", "first_classified_tracker_at_ms"]);
    const cmpScriptLoadedAtMs = getNumberEvidence(input.rawEvidence, ["cmpScriptLoadedAtMs", "cmp_script_loaded_at_ms"]);
    const cmpGapMs = getNumberEvidence(input.rawEvidence, ["cmpGapMs", "cmp_gap_ms"]);
    const hasLoadOrderGap =
      firstClassifiedTrackerAtMs !== null &&
      cmpScriptLoadedAtMs !== null &&
      cmpGapMs !== null &&
      cmpGapMs > 0 &&
      cmpScriptLoadedAtMs > firstClassifiedTrackerAtMs;
    return {
      allowedNarrativeTier: hasLoadOrderGap && cmpGapMs > 3000 ? "strong" : hasLoadOrderGap ? "moderate" : "weak",
      externalSurfacingEligibility: hasLoadOrderGap ? "eligible" : "audit_only",
      negativeEvidenceFlags: hasLoadOrderGap ? [] : ["missing_preconsent_sequence_evidence"],
      promotionEligibility: hasLoadOrderGap ? "eligible" : "internal_only"
    };
  }
  if (suggestedUnifiedFindingId === "accessibility_risk_score") {
    return {
      allowedNarrativeTier: "weak",
      externalSurfacingEligibility: "audit_only",
      negativeEvidenceFlags: ["missing_representative_accessibility_examples"],
      promotionEligibility: "internal_only"
    };
  }
  if (typeof suggestedUnifiedFindingId === "string" && RETIRED_FINANCIAL_FINDING_IDS.has(suggestedUnifiedFindingId)) {
    return {
      allowedNarrativeTier: "weak",
      externalSurfacingEligibility: "suppress",
      negativeEvidenceFlags: [],
      promotionEligibility: "blocked"
    };
  }
  if (suggestedUnifiedFindingId === "scan_quality_visual_no_go") {
    const scanNoGoDecision = getCanonicalStringEvidence(input.rawEvidence, [
      "scanNoGoDecision",
      "scan_no_go_decision",
      "decision"
    ]);
    const scanNoGoConfidence = getNumberEvidence(input.rawEvidence, [
      "scanNoGoConfidence",
      "scan_no_go_confidence"
    ]);
    if (scanNoGoDecision !== null) {
      if (scanNoGoDecision === "no_go" && scanNoGoConfidence !== null && scanNoGoConfidence >= 0.9) {
        return {
          allowedNarrativeTier: "strong",
          externalSurfacingEligibility: "eligible",
          negativeEvidenceFlags: [],
          promotionEligibility: "eligible"
        };
      }
      return {
        allowedNarrativeTier: "weak",
        externalSurfacingEligibility: "audit_only",
        negativeEvidenceFlags: [],
        promotionEligibility: "internal_only"
      };
    }
  }
  if (input.concern.originKey.startsWith("scan_quality.runtime_coverage.")) {
    return {
      allowedNarrativeTier: "weak",
      externalSurfacingEligibility: "audit_only",
      negativeEvidenceFlags: ["runtime_tracking_review_incomplete"],
      promotionEligibility: "internal_only"
    };
  }

  if (isUnmappedFinancialSignalConcern(input.concern)) {
    return {
      allowedNarrativeTier: "weak",
      externalSurfacingEligibility: "audit_only",
      negativeEvidenceFlags: [...negativeEvidenceFlags, "missing_behavior_side_evidence"],
      promotionEligibility: "internal_only"
    };
  }

  const consentSurfaceObserved = getBooleanEvidence(input.rawEvidence, [
    "consentSurfaceObserved",
    "consent_surface_observed",
    "cookieBannerPresent",
    "consentBannerPresent"
  ]);
  const consentActionableChoiceObserved = getBooleanEvidence(input.rawEvidence, [
    "consentActionableChoiceObserved",
    "consent_actionable_choice_observed",
    "consentRejectInteractionSucceeded",
    "consentAcceptInteractionSucceeded"
  ]);

  if (consentSurfaceObserved === false) {
    negativeEvidenceFlags.add("no_consent_surface_observed");
  }
  if (consentActionableChoiceObserved === false) {
    negativeEvidenceFlags.add("no_consent_actionable_choice_observed");
  }
  const runtimePageContextValid = getBooleanEvidence(input.rawEvidence, [
    "runtimePageContextValid",
    "runtime_page_context_valid"
  ]);
  if (isPreconsentConcern(input.concern) && runtimePageContextValid === false) {
    return {
      allowedNarrativeTier: "weak",
      externalSurfacingEligibility: "audit_only",
      negativeEvidenceFlags: [...negativeEvidenceFlags, "runtime_page_context_invalid"],
      promotionEligibility: "internal_only"
    };
  }

  if (isLowConfidencePolicyExtractionConcern(input.concern)) {
    const policyPageType = getConcernPolicyPageType(input.concern, input.rawEvidence);
    const isPrimaryPolicySource = getConcernPolicyPrimarySource(input.concern, input.rawEvidence);

    if (!isCanonicalPolicyPageType(policyPageType) || isPrimaryPolicySource !== true) {
      return {
        allowedNarrativeTier: "weak",
        externalSurfacingEligibility: "suppress",
        negativeEvidenceFlags: [...negativeEvidenceFlags],
        promotionEligibility: "blocked"
      };
    }
  }

  if (isRejectTrackingPersistenceConcern(input.concern)) {
    return {
      allowedNarrativeTier: "weak",
      externalSurfacingEligibility: "audit_only",
      negativeEvidenceFlags: [...negativeEvidenceFlags, "post_choice_flow_deferred_from_core"],
      promotionEligibility: "internal_only"
    };
  }

  if (isCcpaCpraDeferredConcern(input.concern)) {
    return {
      allowedNarrativeTier: "weak",
      externalSurfacingEligibility: "audit_only",
      negativeEvidenceFlags: [...negativeEvidenceFlags, "ccpa_cpra_deferred_from_core"],
      promotionEligibility: "internal_only"
    };
  }

  if (concernRequiresDirectRuntime(input.concern) && !isRejectTrackingPersistenceConcern(input.concern)) {
    const hasSensitiveReplayCooccurrenceRuntime =
      isSensitiveReplayConcern(input.concern) &&
      (
        hasSensitiveSessionReplaySurfaceCooccurrenceArtifact(input.rawEvidence) ||
        hasSensitiveSessionReplayCorrelationLabel(input.rawEvidence)
      );
    const hasScanLevelSensitiveReplayRuntime =
      isScanLevelSensitiveReplayConcern(input.concern) &&
      hasScanLevelSensitiveSessionReplayCoPresenceArtifact(input.rawEvidence);
    const contractDecision = evaluateConcreteRuntimeContract({
      hasConcreteArtifact:
        hasConcreteSessionReplayEvidence(input.rawEvidence) ||
        hasSensitiveReplayCooccurrenceRuntime ||
        hasScanLevelSensitiveReplayRuntime ||
        hasDirectRuntime,
      missingFlag: "no_direct_runtime_replay_artifact_observed",
      originType: input.concern.originType,
      rawEvidence: input.rawEvidence
    });

    if (
      input.concern.originType === "policy_review_queue" ||
      (contractDecision && contractDecision.promotionEligibility !== "eligible")
    ) {
      return {
        allowedNarrativeTier: "weak",
        externalSurfacingEligibility: "audit_only",
        negativeEvidenceFlags: [
          ...negativeEvidenceFlags,
          ...(contractDecision?.negativeEvidenceFlags ?? (hasDirectRuntime ? [] : ["no_direct_runtime_replay_artifact_observed"]))
        ] as NormalizedConcernNegativeEvidenceFlag[],
        promotionEligibility: "internal_only"
      };
    }
  }

  const findingEvidenceContractDecision = evaluateFindingEvidenceContractForRawEvidence(
    input.concern.suggestedUnifiedFindingId,
    input.rawEvidence
  );
  if (
    findingEvidenceContractDecision &&
    findingEvidenceContractDecision.promotionEligibility !== "eligible" &&
    !(isRejectTrackingPersistenceConcern(input.concern) && hasStrongPostRejectTrackerVendorEvidence(input.rawEvidence)) &&
    !(
      (isConsentDarkPatternConcern(input.concern) || isForcedConsentInteractionConcern(input.concern)) &&
      hasConcreteDarkPatternChildEvidence(input.rawEvidence)
    ) &&
    !(
      isSensitiveReplayConcern(input.concern) &&
      (
        hasSensitiveSessionReplaySurfaceCooccurrenceArtifact(input.rawEvidence) ||
        hasSensitiveSessionReplayCorrelationLabel(input.rawEvidence)
      )
    ) &&
    !(
      isSensitiveThirdPartyTrackingConcern(input.concern) &&
      hasSensitiveCollectionSurfaceEvidence(input.rawEvidence) &&
      hasConcreteSensitiveThirdPartyTrackingArtifact(input.rawEvidence)
    )
  ) {
    return {
      allowedNarrativeTier: findingEvidenceContractDecision.allowedNarrativeTier,
      externalSurfacingEligibility: findingEvidenceContractDecision.externalSurfacingEligibility,
      negativeEvidenceFlags: [
        ...negativeEvidenceFlags,
        ...findingEvidenceContractDecision.negativeEvidenceFlags
      ] as NormalizedConcernNegativeEvidenceFlag[],
      promotionEligibility: findingEvidenceContractDecision.promotionEligibility
    };
  }

  if (isBlockingOverlayConcern(input.concern) && !hasMaterialScanBlockingOverlayEvidence(input.rawEvidence)) {
    return {
      allowedNarrativeTier: "weak",
      externalSurfacingEligibility: "audit_only",
      negativeEvidenceFlags: [
        ...negativeEvidenceFlags,
        hasConsentSpecificOverlayEvidence(input.rawEvidence)
          ? "missing_material_scan_blocking_overlay"
          : "ordinary_cookie_banner_only"
      ] as NormalizedConcernNegativeEvidenceFlag[],
      promotionEligibility: "internal_only"
    };
  }

  if (isForcedConsentInteractionConcern(input.concern) && !hasConsentSpecificOverlayEvidence(input.rawEvidence)) {
    return {
      allowedNarrativeTier: "weak",
      externalSurfacingEligibility: "audit_only",
      negativeEvidenceFlags: [...negativeEvidenceFlags, "missing_consent_specific_blocking_evidence"] as NormalizedConcernNegativeEvidenceFlag[],
      promotionEligibility: "internal_only"
    };
  }

  if (isForcedConsentInteractionConcern(input.concern) && hasConcreteDarkPatternChildEvidence(input.rawEvidence)) {
    return {
      allowedNarrativeTier: "strong",
      externalSurfacingEligibility: "eligible",
      negativeEvidenceFlags: [...negativeEvidenceFlags] as NormalizedConcernNegativeEvidenceFlag[],
      promotionEligibility: "eligible"
    };
  }

  if (isConsentControlLifecycleConcern(input.concern)) {
    const review = evaluateConsentControlLifecycleEvidence(input.rawEvidence);
    return {
      allowedNarrativeTier:
        review.disposition === "eligible" && review.confidence === "strong"
          ? "strong"
          : review.disposition === "eligible"
            ? "moderate"
            : "weak",
      externalSurfacingEligibility: review.disposition === "eligible" ? "eligible" : review.disposition,
      negativeEvidenceFlags: [
        ...negativeEvidenceFlags,
        ...review.negativeEvidenceFlags
      ] as NormalizedConcernNegativeEvidenceFlag[],
      promotionEligibility:
        review.disposition === "eligible" ? "eligible" : review.disposition === "audit_only" ? "internal_only" : "blocked"
    };
  }

  if (isConsentGovernanceDisclosureConcern(input.concern)) {
    const review = evaluateConsentGovernanceDisclosureEvidence(input.rawEvidence);
    return {
      allowedNarrativeTier:
        review.disposition === "eligible" && (review.confidence === "strong" || review.confidence === "good")
          ? "moderate"
          : "weak",
      externalSurfacingEligibility: review.disposition === "eligible" ? "audit_only" : review.disposition,
      negativeEvidenceFlags: [
        ...negativeEvidenceFlags,
        ...review.negativeEvidenceFlags
      ] as NormalizedConcernNegativeEvidenceFlag[],
      promotionEligibility: review.disposition === "suppress" ? "blocked" : "internal_only"
    };
  }

  if (isConsentDarkPatternConcern(input.concern) && !hasConcreteDarkPatternChildEvidence(input.rawEvidence)) {
    const consentSurfaceGate = evaluateConsentSurfaceGate(input.rawEvidence);
    return {
      allowedNarrativeTier: "weak",
      externalSurfacingEligibility: "audit_only",
      negativeEvidenceFlags: [
        ...negativeEvidenceFlags,
        ...consentSurfaceGate.states.filter((state) => state !== "consent_surface_observed"),
        "missing_concrete_dark_pattern_child_finding"
      ] as NormalizedConcernNegativeEvidenceFlag[],
      promotionEligibility: "internal_only"
    };
  }

  if (
    isRightsFrictionConcern(input.concern) &&
    input.concern.originType !== "validation_rule"
  ) {
    const contractDecision = evaluateStrongEvidenceContract({
      blockedFlag: "possible_policy_runtime_mismatch",
      meetsThreshold: hasStrongRightsFrictionEvidence(input.rawEvidence),
      missingFlag: "runtime_tracking_review_incomplete",
      originType: input.concern.originType
    });

    if (contractDecision) {
      return {
        ...contractDecision,
        negativeEvidenceFlags: [...negativeEvidenceFlags, ...contractDecision.negativeEvidenceFlags] as NormalizedConcernNegativeEvidenceFlag[]
      };
    }
  }

  if (
    isHighSensitivityConcern(input.concern) &&
    !isSensitiveReplayConcern(input.concern) &&
    !isScanLevelSensitiveReplayConcern(input.concern) &&
    !isSensitiveThirdPartyTrackingConcern(input.concern) &&
    input.concern.originType !== "validation_rule"
  ) {
    const contractDecision = evaluateStrongEvidenceContract({
      blockedFlag: "runtime_tracking_review_incomplete",
      meetsThreshold: hasSensitivePayloadEvidence(input.rawEvidence),
      missingFlag: "missing_specific_runtime_anchor",
      originType: input.concern.originType
    });

    if (contractDecision) {
      return {
        ...contractDecision,
        negativeEvidenceFlags: [...negativeEvidenceFlags, ...contractDecision.negativeEvidenceFlags] as NormalizedConcernNegativeEvidenceFlag[]
      };
    }
  }

  if (
    isSensitiveReplayConcern(input.concern) &&
    hasSensitiveSessionReplayCorrelationLabel(input.rawEvidence)
  ) {
    return {
      allowedNarrativeTier: "moderate",
      externalSurfacingEligibility: "eligible",
      negativeEvidenceFlags: [...negativeEvidenceFlags],
      promotionEligibility: "eligible"
    };
  }

  if (
    isSensitiveReplayConcern(input.concern) &&
    !hasSensitiveSessionReplaySurfaceCooccurrenceArtifact(input.rawEvidence) &&
    !hasSensitiveSessionReplayCorrelationLabel(input.rawEvidence)
  ) {
    return {
      allowedNarrativeTier: "weak",
      externalSurfacingEligibility: "audit_only",
      negativeEvidenceFlags: [...negativeEvidenceFlags, "missing_concrete_sensitive_payload"],
      promotionEligibility: "internal_only"
    };
  }

  if (
    isScanLevelSensitiveReplayConcern(input.concern) &&
    !hasScanLevelSensitiveSessionReplayCoPresenceArtifact(input.rawEvidence)
  ) {
    return {
      allowedNarrativeTier: "weak",
      externalSurfacingEligibility: "audit_only",
      negativeEvidenceFlags: [...negativeEvidenceFlags, "missing_concrete_sensitive_payload"],
      promotionEligibility: "internal_only"
    };
  }

  if (isSensitiveThirdPartyTrackingConcern(input.concern)) {
    if (!hasSensitiveCollectionSurfaceEvidence(input.rawEvidence)) {
      return {
        allowedNarrativeTier: "weak",
        externalSurfacingEligibility: "audit_only",
        negativeEvidenceFlags: [...negativeEvidenceFlags, "missing_concrete_sensitive_payload"],
        promotionEligibility: "internal_only"
      };
    }

    if (!hasConcreteSensitiveThirdPartyTrackingArtifact(input.rawEvidence)) {
      return {
        allowedNarrativeTier: "weak",
        externalSurfacingEligibility: "audit_only",
        negativeEvidenceFlags: [...negativeEvidenceFlags, "missing_third_party_tracking_artifact"],
        promotionEligibility: "internal_only"
      };
    }
  }

  if (isDsarConcern(input.concern)) {
    const extractionStatus = getPolicyExtractionStatus(input.rawEvidence);
    const rightsSignals = getPolicyRightsSignals(input.rawEvidence);

    if (rightsSignals.length > 0) {
      negativeEvidenceFlags.add("policy_rights_language_observed");
    }
    if (extractionStatus === "fetched") {
      negativeEvidenceFlags.add("policy_target_retrievable");
    }
    if (extractionStatus !== null && extractionStatus !== "fetched") {
      negativeEvidenceFlags.add("policy_target_parsing_incomplete");
    }

    if (extractionStatus !== null && extractionStatus !== "fetched") {
      return {
        allowedNarrativeTier: "weak",
        externalSurfacingEligibility: "suppress",
        negativeEvidenceFlags: [...negativeEvidenceFlags],
        promotionEligibility: "blocked"
      };
    }

    if (rightsSignals.length > 0) {
      return {
        allowedNarrativeTier: "weak",
        externalSurfacingEligibility: "suppress",
        negativeEvidenceFlags: [...negativeEvidenceFlags],
        promotionEligibility: "blocked"
      };
    }

    if (input.concern.originType !== "validation_rule" && !hasConcreteDsarEvidence(input.rawEvidence)) {
      return {
        allowedNarrativeTier: "weak",
        externalSurfacingEligibility: "suppress",
        negativeEvidenceFlags: [...negativeEvidenceFlags],
        promotionEligibility: "blocked"
      };
    }
  }

  if (isStructuredPolicyDisclosureGapConcern(input.concern)) {
    const extractionStatus = getPolicyExtractionStatus(input.rawEvidence);

    if (extractionStatus !== "fetched") {
      if (extractionStatus !== null) {
        negativeEvidenceFlags.add("policy_target_parsing_incomplete");
      }

      return {
        allowedNarrativeTier: "weak",
        externalSurfacingEligibility: "suppress",
        negativeEvidenceFlags: [...negativeEvidenceFlags],
        promotionEligibility: "blocked"
      };
    }

    if (!hasStrongStructuredPolicyDisclosureGapEvidence(input.rawEvidence)) {
      return {
        allowedNarrativeTier: "weak",
        externalSurfacingEligibility: "audit_only",
        negativeEvidenceFlags: [...negativeEvidenceFlags],
        promotionEligibility: "internal_only"
      };
    }

    return {
      allowedNarrativeTier: "moderate",
      externalSurfacingEligibility: "eligible",
      negativeEvidenceFlags: [...negativeEvidenceFlags],
      promotionEligibility: "eligible"
    };
  }

  if (isRetargetingConcern(input.concern)) {
    const contractDecision = evaluateConcreteRuntimeContract({
      hasConcreteArtifact: hasConcreteRetargetingEvidence(input.rawEvidence),
      missingFlag: "no_direct_runtime_retargeting_artifact_observed",
      originType: input.concern.originType,
      rawEvidence: input.rawEvidence
    });

    if (contractDecision && contractDecision.promotionEligibility !== "eligible") {
      return {
        ...contractDecision,
        negativeEvidenceFlags: [...negativeEvidenceFlags, ...contractDecision.negativeEvidenceFlags] as NormalizedConcernNegativeEvidenceFlag[]
      };
    }

    return {
      allowedNarrativeTier: "moderate",
      externalSurfacingEligibility: "eligible",
      negativeEvidenceFlags: [...negativeEvidenceFlags],
      promotionEligibility: "eligible"
    };
  }

  if (isCrossDomainIdentifierSharingConcern(input.concern)) {
    if (!hasConcreteCrossDomainIdentifierSharingEvidence(input.rawEvidence)) {
      return {
        allowedNarrativeTier: "weak",
        externalSurfacingEligibility: "audit_only",
        negativeEvidenceFlags: [...negativeEvidenceFlags, "missing_specific_runtime_anchor"],
        promotionEligibility: "internal_only"
      };
    }

    return {
      allowedNarrativeTier: "strong",
      externalSurfacingEligibility: "eligible",
      negativeEvidenceFlags: [...negativeEvidenceFlags],
      promotionEligibility: "eligible"
    };
  }

  if (isRejectTrackingPersistenceConcern(input.concern)) {
    return {
      allowedNarrativeTier: "weak",
      externalSurfacingEligibility: "audit_only",
      negativeEvidenceFlags: [...negativeEvidenceFlags, "post_choice_flow_deferred_from_core"],
      promotionEligibility: "internal_only"
    };
  }

  if (isCcpaCpraDeferredConcern(input.concern)) {
    return {
      allowedNarrativeTier: "weak",
      externalSurfacingEligibility: "audit_only",
      negativeEvidenceFlags: [...negativeEvidenceFlags, "ccpa_cpra_deferred_from_core"],
      promotionEligibility: "internal_only"
    };
  }

  if (isVideoContentTrackingConcern(input.concern)) {
    if (!hasVideoContentSurfaceEvidence(input.rawEvidence)) {
      return {
        allowedNarrativeTier: "weak",
        externalSurfacingEligibility: "audit_only",
        negativeEvidenceFlags: [...negativeEvidenceFlags, "missing_specific_runtime_anchor"],
        promotionEligibility: "internal_only"
      };
    }

    if (!hasMetaPixelEvidence(input.rawEvidence)) {
      return {
        allowedNarrativeTier: "weak",
        externalSurfacingEligibility: "audit_only",
        negativeEvidenceFlags: [...negativeEvidenceFlags, "missing_third_party_tracking_artifact"],
        promotionEligibility: "internal_only"
      };
    }

    if (!hasSamePageVideoTrackingCorrelation(input.rawEvidence)) {
      return {
        allowedNarrativeTier: "weak",
        externalSurfacingEligibility: "audit_only",
        negativeEvidenceFlags: [...negativeEvidenceFlags, "missing_specific_runtime_anchor"],
        promotionEligibility: "internal_only"
      };
    }

    return {
      allowedNarrativeTier: hasVideoPayloadFieldHints(input.rawEvidence) ? "strong" : "moderate",
      externalSurfacingEligibility: "eligible",
      negativeEvidenceFlags: [...negativeEvidenceFlags],
      promotionEligibility: "eligible"
    };
  }

  if (isFingerprintingConcern(input.concern)) {
    if (!hasStrongFingerprintingEvidence(input.rawEvidence)) {
      return {
        allowedNarrativeTier: "weak",
        externalSurfacingEligibility: "audit_only",
        negativeEvidenceFlags: [...negativeEvidenceFlags],
        promotionEligibility: "internal_only"
      };
    }

    return {
      allowedNarrativeTier: "moderate",
      externalSurfacingEligibility: "eligible",
      negativeEvidenceFlags: [...negativeEvidenceFlags],
      promotionEligibility: "eligible"
    };
  }

  if (isContradictionConcern(input.concern)) {
    if (input.concern.suggestedUnifiedFindingId === "consent_gated_tracking_claim_conflict") {
      const contractDecision = evaluateConsentGatedTrackingConflictContract(input.rawEvidence);
      if (contractDecision) {
        return {
          ...contractDecision,
          negativeEvidenceFlags: [...negativeEvidenceFlags, ...contractDecision.negativeEvidenceFlags] as NormalizedConcernNegativeEvidenceFlag[]
        };
      }
    }

    if (input.concern.suggestedUnifiedFindingId === "policy_behavior_conflict") {
      const contractDecision = evaluatePolicyBehaviorConflictContract(input.rawEvidence);
      if (contractDecision) {
        return {
          ...contractDecision,
          negativeEvidenceFlags: [...negativeEvidenceFlags, ...contractDecision.negativeEvidenceFlags] as NormalizedConcernNegativeEvidenceFlag[]
        };
      }
    }

    const hasPolicyEvidence = hasPolicySideEvidence(input.rawEvidence, input.evidenceStrengthFlags);
    const hasBehaviorEvidence = hasBehaviorSideEvidence(input.rawEvidence, input.evidenceStrengthFlags);

    if (!hasPolicyEvidence) {
      negativeEvidenceFlags.add("missing_policy_side_evidence");
    }
    if (!hasBehaviorEvidence) {
      negativeEvidenceFlags.add("missing_behavior_side_evidence");
    }

    if (!hasBehaviorEvidence || !hasPolicyEvidence) {
      return {
        allowedNarrativeTier: "weak",
        externalSurfacingEligibility: "audit_only",
        negativeEvidenceFlags: [...negativeEvidenceFlags],
        promotionEligibility: "internal_only"
      };
    }
  }

  if (isConsentSurfaceMissingConcern(input.concern) && !hasConcreteConsentSurfaceAbsenceEvidence(input.rawEvidence)) {
    return {
      allowedNarrativeTier: "weak",
      externalSurfacingEligibility: "audit_only",
      negativeEvidenceFlags: [...negativeEvidenceFlags],
      promotionEligibility: "internal_only"
    };
  }

  if (
    isWeakCookieSecurityAttributesConcern(input.concern) &&
    !hasPromotableWeakCookieAttributeEvidence(input.rawEvidence)
  ) {
    return {
      allowedNarrativeTier: "weak",
      externalSurfacingEligibility: "audit_only",
      negativeEvidenceFlags: [...negativeEvidenceFlags],
      promotionEligibility: "internal_only"
    };
  }

  if (
    isAccessibilitySupportPathMissingConcern(input.concern) &&
    input.concern.originType !== "validation_rule" &&
    !hasStrongAccessibilitySupportPathMissingEvidence(input.rawEvidence)
  ) {
    return {
      allowedNarrativeTier: "weak",
      externalSurfacingEligibility: "audit_only",
      negativeEvidenceFlags: [...negativeEvidenceFlags, "missing_representative_accessibility_examples"],
      promotionEligibility: "internal_only"
    };
  }

  if (
    isSaleSharingControlsMissingConcern(input.concern) &&
    input.concern.originType !== "validation_rule" &&
    !hasStrongSaleSharingControlsMissingEvidence(input.rawEvidence)
  ) {
    return {
      allowedNarrativeTier: "weak",
      externalSurfacingEligibility: "audit_only",
      negativeEvidenceFlags: [...negativeEvidenceFlags, "missing_policy_side_evidence"],
      promotionEligibility: "internal_only"
    };
  }

  if (
    input.concern.suggestedUnifiedFindingId === "gpc_signal_not_honored" &&
    !hasMeaningfulGpcIgnoredEvidence(input.rawEvidence)
  ) {
    return {
      allowedNarrativeTier: "weak",
      externalSurfacingEligibility: "audit_only",
      negativeEvidenceFlags: [...negativeEvidenceFlags],
      promotionEligibility: "internal_only"
    };
  }

  if (
    isCommercialEvidenceConcern(input.concern) &&
    input.concern.originType !== "validation_rule" &&
    !hasDirectRuntime &&
    !hasPageAttribution &&
    !hasSubstantivePageOrSnippetEvidence(input.rawEvidence)
  ) {
    return {
      allowedNarrativeTier: "weak",
      externalSurfacingEligibility: "audit_only",
      negativeEvidenceFlags: [...negativeEvidenceFlags],
      promotionEligibility: "internal_only"
    };
  }

  if (
    isNegativeFinancialPromotionConcern(input.concern) &&
    !hasFinancialOfferContext(input.rawEvidence)
  ) {
    const domainIndustryPrimary = getFirstString(input.rawEvidence, [
      "domainIndustryPrimary",
      "domain_industry_primary"
    ]);
    // When the domain is explicitly classified as non-finance, fully suppress
    // the financial concern. Otherwise keep it audit-only for internal review.
    if (domainIndustryPrimary && domainIndustryPrimary !== "finance" && domainIndustryPrimary !== "crypto") {
      return {
        allowedNarrativeTier: "weak",
        externalSurfacingEligibility: "suppress",
        negativeEvidenceFlags: [...negativeEvidenceFlags, "missing_behavior_side_evidence"],
        promotionEligibility: "blocked"
      };
    }
    return {
      allowedNarrativeTier: "weak",
      externalSurfacingEligibility: "audit_only",
      negativeEvidenceFlags: [...negativeEvidenceFlags, "missing_behavior_side_evidence"],
      promotionEligibility: "internal_only"
    };
  }

  if (isSurfaceIntegrityConcern(input.concern)) {
    if (!hasPageAttribution || !hasSubstantivePageOrSnippetEvidence(input.rawEvidence)) {
      return {
        allowedNarrativeTier: "weak",
        externalSurfacingEligibility: "audit_only",
        negativeEvidenceFlags: [...negativeEvidenceFlags],
        promotionEligibility: "internal_only"
      };
    }

    return {
      allowedNarrativeTier: "moderate",
      externalSurfacingEligibility: "eligible",
      negativeEvidenceFlags: [...negativeEvidenceFlags],
      promotionEligibility: "eligible"
    };
  }

  if (isDisclosurePlacementConcern(input.concern)) {
    if (!hasPageAttribution || !hasSubstantivePageOrSnippetEvidence(input.rawEvidence)) {
      return {
        allowedNarrativeTier: "weak",
        externalSurfacingEligibility: "audit_only",
        negativeEvidenceFlags: [...negativeEvidenceFlags],
        promotionEligibility: "internal_only"
      };
    }

    return {
      allowedNarrativeTier: "moderate",
      externalSurfacingEligibility: "eligible",
      negativeEvidenceFlags: [...negativeEvidenceFlags],
      promotionEligibility: "eligible"
    };
  }

  if (
    isDomainLevelSensitiveContextFinding(input.concern.suggestedUnifiedFindingId ?? "") &&
    !hasSubstantivePageOrSnippetEvidence(input.rawEvidence)
  ) {
    return {
      allowedNarrativeTier: "weak",
      externalSurfacingEligibility: "audit_only",
      negativeEvidenceFlags: [...negativeEvidenceFlags],
      promotionEligibility: "internal_only"
    };
  }

  if (isFocusManagementIssueConcern(input.concern)) {
    if (!hasBehaviorReproducedFocusManagementEvidence(input.rawEvidence)) {
      return {
        allowedNarrativeTier: "weak",
        externalSurfacingEligibility: "audit_only",
        negativeEvidenceFlags: [...negativeEvidenceFlags, "missing_specific_runtime_anchor"],
        promotionEligibility: "internal_only"
      };
    }

    return {
      allowedNarrativeTier: "strong",
      externalSurfacingEligibility: "eligible",
      negativeEvidenceFlags: [...negativeEvidenceFlags],
      promotionEligibility: "eligible"
    };
  }

  if (isSplitAccessibilityIssueConcern(input.concern)) {
    const findingId = input.concern.suggestedUnifiedFindingId ?? "";
    const hasFindingExamples = hasCompleteExamplesForAccessibilityFinding(input.rawEvidence, findingId);
    const hasOnlyDocumentMetadataExamples = hasOnlyDocumentMetadataAccessibilityExamples(input.rawEvidence);
    const keyboardPromotable =
      findingId !== "keyboard_navigation_accessibility_issue" ||
      hasPromotableKeyboardAccessibilityEvidence(input.rawEvidence);
    const semanticPromotable =
      findingId !== "semantic_labeling_accessibility_issue" ||
      hasPromotableSemanticLabelingAccessibilityEvidence(input.rawEvidence);

    if (!hasFindingExamples || !keyboardPromotable || !semanticPromotable) {
      const coverage = getRepresentativeAccessibilityExampleCoverage(input.rawEvidence);
      negativeEvidenceFlags.add(
        hasOnlyDocumentMetadataExamples
          ? "document_metadata_rule_not_top_finding_eligible"
          : coverage.representativeExampleCount > 0
          ? "accessibility_examples_below_promotion_threshold"
          : "missing_representative_accessibility_examples"
      );

      return {
        allowedNarrativeTier: "weak",
        externalSurfacingEligibility: "audit_only",
        negativeEvidenceFlags: [...negativeEvidenceFlags],
        promotionEligibility: "internal_only"
      };
    }

    return {
      allowedNarrativeTier: findingId === "keyboard_navigation_accessibility_issue" ? "strong" : "moderate",
      externalSurfacingEligibility: "eligible",
      negativeEvidenceFlags: [...negativeEvidenceFlags],
      promotionEligibility: "eligible"
    };
  }

  if (
    isAccessibilityIssueFindingConcern(input.concern) &&
    !hasRepresentativeAccessibilityExamples(input.rawEvidence)
  ) {
    const coverage = getRepresentativeAccessibilityExampleCoverage(input.rawEvidence);
    negativeEvidenceFlags.add(
      coverage.representativeExampleCount > 0
        ? "accessibility_examples_below_promotion_threshold"
        : "missing_representative_accessibility_examples"
    );

    return {
      allowedNarrativeTier: "weak",
      externalSurfacingEligibility: "audit_only",
      negativeEvidenceFlags: [...negativeEvidenceFlags],
      promotionEligibility: "internal_only"
    };
  }

  if (
    isCoverageGapSurfaceMissingConcern(input.concern) &&
    !hasStrongCoverageGapSurfaceMissingEvidence(input.concern, {
      evidenceStrengthFlags: input.evidenceStrengthFlags,
      rawEvidence: input.rawEvidence
    })
  ) {
    return {
      allowedNarrativeTier: "weak",
      externalSurfacingEligibility: "audit_only",
      negativeEvidenceFlags: [...negativeEvidenceFlags],
      promotionEligibility: "internal_only"
    };
  }

  if (
    isCoverageGapUnavailableConcern(input.concern) &&
    isGuessedOnlyDiscovery(input.rawEvidence) &&
    !hasStableLinkedDiscoveryPath(input.rawEvidence)
  ) {
    return {
      allowedNarrativeTier: "weak",
      externalSurfacingEligibility: "audit_only",
      negativeEvidenceFlags: [...negativeEvidenceFlags],
      promotionEligibility: "internal_only"
    };
  }

  if (isGdprTransparencyLegalFrameworkValidityConcern(input.rawEvidence)) {
    negativeEvidenceFlags.add("stale_legal_framework_reference_observed");
    return {
      allowedNarrativeTier: "weak",
      externalSurfacingEligibility: "audit_only",
      negativeEvidenceFlags: [...negativeEvidenceFlags],
      promotionEligibility: "internal_only",
      regulatoryChecklistEligibility: "review_signal"
    };
  }

  if (isGdprTransparencyArticle13EvidenceConcern(input.rawEvidence)) {
    const regulatoryChecklistEligibility = getGdprTransparencyArticle13ChecklistEligibility(input.rawEvidence);
    if (
      getBooleanEvidence(input.rawEvidence, [
        "staleLegalFrameworkReferenceObserved",
        "stale_legal_framework_reference_observed"
      ]) === true
    ) {
      negativeEvidenceFlags.add("stale_legal_framework_reference_observed");
    }
    return {
      allowedNarrativeTier:
        getFirstString(input.rawEvidence, [
          "gdprTransparencyArticle13ConcernState",
          "gdpr_transparency_article13_concern_state"
        ]) === "sufficient"
          ? "moderate"
          : "weak",
      externalSurfacingEligibility: "audit_only",
      negativeEvidenceFlags: [...negativeEvidenceFlags],
      promotionEligibility: "internal_only",
      regulatoryChecklistEligibility
    };
  }

  if (
    isBoundedKeyPageDiscoveryUnresolvedConcern(input.concern) &&
    hasStableLinkedDiscoveryPath(input.rawEvidence) &&
    hasExpectedLegalPageCoverage(input.rawEvidence)
  ) {
    return {
      allowedNarrativeTier: "weak",
      externalSurfacingEligibility: "suppress",
      negativeEvidenceFlags: [...negativeEvidenceFlags],
      promotionEligibility: "blocked"
    };
  }

  if (isBoundedKeyPageDiscoveryUnresolvedConcern(input.concern)) {
    return {
      allowedNarrativeTier: "weak",
      externalSurfacingEligibility: "audit_only",
      negativeEvidenceFlags: [...negativeEvidenceFlags],
      promotionEligibility: "internal_only"
    };
  }

  if (isFinancialValidationFindingId(input.concern.suggestedUnifiedFindingId)) {
    const inferredFinancialPageClassification =
      input.concern.suggestedUnifiedFindingId === "legal_entity_name_present" ||
      input.concern.suggestedUnifiedFindingId === "operator_contact_path_present"
        ? "identity_or_contact"
        : input.concern.suggestedUnifiedFindingId === "fee_disclosure_present"
          ? "pricing_or_fees"
          : input.concern.suggestedUnifiedFindingId === "investment_risk_disclosure_present" ||
              input.concern.suggestedUnifiedFindingId === "past_performance_disclaimer_present"
            ? "disclosure_or_legal"
            : "financial_offer";
    const evidence = getFinancialValidationEvidenceBundle({
      ...(input.rawEvidence ?? {}),
      pageClassification: inferredFinancialPageClassification
    });

    if (!evidence) {
      return {
        allowedNarrativeTier: "weak",
        externalSurfacingEligibility: "audit_only",
        negativeEvidenceFlags: [...negativeEvidenceFlags],
        promotionEligibility: "internal_only"
      };
    }

    const judge =
      getStoredFinancialJudgeOutput(input.rawEvidence) ??
      evaluateFinancialJudgeInput({
        candidateFindingId: input.concern.suggestedUnifiedFindingId,
        evidence,
        negativeEvidenceFlags: [...negativeEvidenceFlags],
        scanContext: {
          domain: getFirstString(input.rawEvidence, ["domain", "hostname", "host"]),
          pageType: getFirstString(input.rawEvidence, ["pageType", "page_type"])
        }
      });

    if (judge.verdict === "suppress") {
      return {
        allowedNarrativeTier: "weak",
        externalSurfacingEligibility: "suppress",
        negativeEvidenceFlags: [...negativeEvidenceFlags],
        promotionEligibility: "blocked"
      };
    }

    if (judge.verdict === "keep_audit_only") {
      return {
        allowedNarrativeTier: "weak",
        externalSurfacingEligibility: "audit_only",
        negativeEvidenceFlags: [...negativeEvidenceFlags],
        promotionEligibility: "internal_only"
      };
    }

    return {
      allowedNarrativeTier: "moderate",
      externalSurfacingEligibility: "eligible",
      negativeEvidenceFlags: [...negativeEvidenceFlags],
      promotionEligibility: "eligible"
    };
  }

  if (concernRequiresPageAttribution(input.concern) && !hasDirectRuntime && !hasPageAttribution && !hasKeyPageDiscovery) {
    return {
      allowedNarrativeTier: "weak",
      externalSurfacingEligibility: "audit_only",
      negativeEvidenceFlags: [...negativeEvidenceFlags],
      promotionEligibility: "internal_only"
    };
  }

  if (isPositiveInfrastructureConcern(input.concern)) {
    const policyPageType = getConcernPolicyPageType(input.concern, input.rawEvidence);
    const blockedOrInterstitialEvidence = hasBlockedOrInterstitialEvidence(input.rawEvidence);
    const positiveInfrastructureEvidenceGrade = getPositiveInfrastructureEvidenceGrade(input.concern, input.rawEvidence);
    const hasVerifiedContentEvidence = positiveInfrastructureEvidenceGrade === "verified";
    const hasCorroboratedSurfaceEvidence = positiveInfrastructureEvidenceGrade === "corroborated";

    if (input.concern.originType === "policy_enrichment" && policyPageType === "non_policy") {
      return {
        allowedNarrativeTier: "weak",
        externalSurfacingEligibility: "audit_only",
        negativeEvidenceFlags: [...negativeEvidenceFlags],
        promotionEligibility: "internal_only"
      };
    }

    if (blockedOrInterstitialEvidence && !hasCorroboratedSurfaceEvidence) {
      negativeEvidenceFlags.add("blocked_or_interstitial_evidence_observed");
    }
    if (!hasVerifiedContentEvidence && !hasCorroboratedSurfaceEvidence) {
      negativeEvidenceFlags.add("positive_surface_content_unverified");
    }
    if (
      input.concern.suggestedUnifiedFindingId === "privacy_contact_path_present" &&
      !hasPrivacySpecificContactChannelEvidence(input.rawEvidence)
    ) {
      negativeEvidenceFlags.add("missing_privacy_specific_contact_channel");
    }

    if (
      (!hasVerifiedContentEvidence && !hasCorroboratedSurfaceEvidence) ||
      negativeEvidenceFlags.has("missing_privacy_specific_contact_channel")
    ) {
      return {
        allowedNarrativeTier: "weak",
        externalSurfacingEligibility: "audit_only",
        negativeEvidenceFlags: [...negativeEvidenceFlags],
        promotionEligibility: "internal_only"
      };
    }

    return {
      allowedNarrativeTier: hasVerifiedContentEvidence || hasCorroboratedSurfaceEvidence ? "moderate" : "weak",
      externalSurfacingEligibility: "eligible",
      negativeEvidenceFlags: [...negativeEvidenceFlags],
      promotionEligibility: "eligible"
    };
  }

  if (isRtbCookieSyncConcern(input.concern)) {
    if (!hasConcreteRtbCookieSyncEvidence(input.rawEvidence)) {
      return {
        allowedNarrativeTier: "weak",
        externalSurfacingEligibility: "audit_only",
        negativeEvidenceFlags: [...negativeEvidenceFlags, "missing_specific_runtime_anchor"],
        promotionEligibility: "internal_only"
      };
    }

    return {
      allowedNarrativeTier: hasPreconsentSequenceEvidence(input.rawEvidence) ? "strong" : "moderate",
      externalSurfacingEligibility: "eligible",
      negativeEvidenceFlags: [...negativeEvidenceFlags],
      promotionEligibility: "eligible"
    };
  }

  if (isPreSubmitTextCaptureConcern(input.concern)) {
    if (!hasStrongPreSubmitTextCaptureEvidence(input.rawEvidence)) {
      return {
        allowedNarrativeTier: "weak",
        externalSurfacingEligibility: "audit_only",
        negativeEvidenceFlags: [...negativeEvidenceFlags, "missing_third_party_tracking_artifact"],
        promotionEligibility: "internal_only"
      };
    }

    return {
      allowedNarrativeTier: "strong",
      externalSurfacingEligibility: "eligible",
      negativeEvidenceFlags: [...negativeEvidenceFlags],
      promotionEligibility: "eligible"
    };
  }

  if (isPreconsentConcern(input.concern)) {
    if (!hasConcretePreconsentArtifact(input.rawEvidence)) {
      negativeEvidenceFlags.add("missing_concrete_preconsent_artifact");
    }
    if (!hasPreconsentSequenceEvidence(input.rawEvidence)) {
      negativeEvidenceFlags.add("missing_preconsent_sequence_evidence");
    }

    if (!hasStrongPreconsentRuntimeEvidence(input.rawEvidence)) {
      return {
        allowedNarrativeTier: "weak",
        externalSurfacingEligibility: "audit_only",
        negativeEvidenceFlags: [...negativeEvidenceFlags],
        promotionEligibility: "internal_only"
      };
    }

    const hasStrongConsentTimingEvidence = consentSurfaceObserved === true && consentActionableChoiceObserved === true;

    return {
      allowedNarrativeTier: hasStrongConsentTimingEvidence ? "strong" : "moderate",
      externalSurfacingEligibility: "eligible",
      negativeEvidenceFlags: [...negativeEvidenceFlags],
      promotionEligibility: "eligible"
    };
  }

  if (isCookieDisclosureGapConcern(input.concern)) {
    if (hasOnlyIgnoredCookieDisclosureGapEvidence(input.rawEvidence)) {
      return {
        allowedNarrativeTier: "weak",
        externalSurfacingEligibility: "suppress",
        negativeEvidenceFlags: [...negativeEvidenceFlags, "runtime_cookie_inventory_ignored_only"],
        promotionEligibility: "blocked"
      };
    }

    return {
      allowedNarrativeTier: findingEvidenceContractDecision?.allowedNarrativeTier ?? "moderate",
      externalSurfacingEligibility: "eligible",
      negativeEvidenceFlags: [...negativeEvidenceFlags],
      promotionEligibility: "eligible"
    };
  }

  if (isDsarConcern(input.concern)) {
    return {
      allowedNarrativeTier: "moderate",
      externalSurfacingEligibility: "eligible",
      negativeEvidenceFlags: [...negativeEvidenceFlags],
      promotionEligibility: "eligible"
    };
  }

  if (isReplayConcern(input.concern)) {
    return {
      allowedNarrativeTier: "moderate",
      externalSurfacingEligibility: "eligible",
      negativeEvidenceFlags: [...negativeEvidenceFlags],
      promotionEligibility: "eligible"
    };
  }

  if (isContradictionConcern(input.concern)) {
    return {
      allowedNarrativeTier: "moderate",
      externalSurfacingEligibility: "eligible",
      negativeEvidenceFlags: [...negativeEvidenceFlags],
      promotionEligibility: "eligible"
    };
  }

  return {
    allowedNarrativeTier: "strong",
    externalSurfacingEligibility: "eligible",
    negativeEvidenceFlags: [...negativeEvidenceFlags],
    promotionEligibility: "eligible"
  };
}
