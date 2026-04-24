import assert from "node:assert/strict";
import test from "node:test";

import {
  concernRequiresDirectRuntime,
  concernRequiresPageAttribution,
  deriveConcernPolicy,
  isDomainLevelChildrenDisclosureFinding,
  isDomainLevelSensitiveContextFinding,
  packetNeedsPageAttribution
} from "./concern-policy";
import { ADA_ACCESSIBILITY_FIXTURES } from "./ada-accessibility.fixtures";
import type { NormalizedConcern } from "./normalized-concerns";
import { POLICY_BEHAVIOR_CONFLICT_FIXTURES } from "./policy-behavior-conflict.fixtures";

function makeConcern(
  overrides: Partial<
    Pick<
      NormalizedConcern,
      "canonicalConcernKey" | "originKey" | "originType" | "policyIsPrimarySource" | "policyPageType" | "suggestedUnifiedFindingId" | "title"
    >
  >
) {
  return {
    canonicalConcernKey: "test",
    originKey: "test",
    originType: "snapshot_signal",
    policyIsPrimarySource: null,
    policyPageType: null,
    suggestedUnifiedFindingId: undefined,
    title: "Test concern",
    ...overrides
  } satisfies Pick<
    NormalizedConcern,
    "canonicalConcernKey" | "originKey" | "originType" | "policyIsPrimarySource" | "policyPageType" | "suggestedUnifiedFindingId" | "title"
  >;
}

test("deriveConcernPolicy handles the main concern families consistently", () => {
  const cases = [
    {
      name: "low-confidence policy extraction on a non-policy page is blocked",
      concern: makeConcern({
        originKey: "policySemanticConfidence",
        originType: "policy_enrichment",
        policyPageType: "non_policy",
        suggestedUnifiedFindingId: "low_confidence_policy_extraction",
        title: "Low-confidence policy extraction"
      }),
      evidenceStrengthFlags: ["policy_text", "page_attributed"] as const,
      rawEvidence: {
        pageType: "non_policy",
        policySemanticConfidence: 0.5
      },
      expected: {
        allowedNarrativeTier: "weak",
        promotionEligibility: "blocked",
        externalSurfacingEligibility: "suppress",
        negativeEvidenceFlags: []
      }
    },
    {
      name: "low-confidence policy extraction on a non-primary policy row is blocked",
      concern: makeConcern({
        originKey: "policySemanticConfidence",
        originType: "policy_enrichment",
        policyIsPrimarySource: false,
        policyPageType: "privacy_policy",
        suggestedUnifiedFindingId: "low_confidence_policy_extraction",
        title: "Low-confidence policy extraction"
      }),
      evidenceStrengthFlags: ["policy_text", "page_attributed"] as const,
      rawEvidence: {
        isPrimaryPolicy: false,
        pageType: "privacy_policy",
        policySemanticConfidence: 0.5
      },
      expected: {
        allowedNarrativeTier: "weak",
        promotionEligibility: "blocked",
        externalSurfacingEligibility: "suppress",
        negativeEvidenceFlags: []
      }
    },
    {
      name: "positive privacy surface on a generic shell page stays internal",
      concern: makeConcern({
        originKey: "disclosure.privacy_policy_present",
        suggestedUnifiedFindingId: "privacy_policy_present",
        title: "Privacy policy surface present"
      }),
      evidenceStrengthFlags: ["policy_text", "page_attributed", "fallback_only"] as const,
      rawEvidence: {
        familyPacketFindingId: "privacy_policy_present",
        fetchQuality: "verified_content",
        pageUrl: "https://www.starz.com/us/en/privacy",
        policySnippets: ["STARZ - Captivating Original Series. Hit Movies. Bold Storytelling."]
      },
      expected: {
        allowedNarrativeTier: "weak",
        promotionEligibility: "internal_only",
        externalSurfacingEligibility: "audit_only",
        negativeEvidenceFlags: ["positive_surface_content_unverified"]
      }
    },
    {
      name: "replay without direct runtime stays internal",
      concern: makeConcern({
        originKey: "privacy.session_replay_runtime_detected",
        suggestedUnifiedFindingId: "session_replay_undisclosed",
        title: "Possible replay/disclosure mismatch"
      }),
      evidenceStrengthFlags: ["fallback_only"] as const,
      rawEvidence: {
        runtimeEvidenceArtifacts: []
      },
      expected: {
        allowedNarrativeTier: "weak",
        promotionEligibility: "internal_only",
        externalSurfacingEligibility: "audit_only",
        negativeEvidenceFlags: ["no_direct_runtime_replay_artifact_observed"]
      }
    },
    {
      name: "replay with vendor-only hints still stays internal",
      concern: makeConcern({
        originKey: "privacy.session_replay_runtime_detected",
        suggestedUnifiedFindingId: "session_replay_undisclosed",
        title: "Possible replay/disclosure mismatch"
      }),
      evidenceStrengthFlags: ["fallback_only"] as const,
      rawEvidence: {
        sessionReplayRuntimeVendors: ["Hotjar"]
      },
      expected: {
        allowedNarrativeTier: "weak",
        promotionEligibility: "internal_only",
        externalSurfacingEligibility: "audit_only",
        negativeEvidenceFlags: ["no_direct_runtime_replay_artifact_observed"]
      }
    },
    {
      name: "retargeting without retained runtime artifacts stays audit-only",
      concern: makeConcern({
        originKey: "scan_snapshot.commerce.retargeting_pixel_detected",
        suggestedUnifiedFindingId: "retargeting_pixel_observed",
        title: "Retargeting pixel detected"
      }),
      evidenceStrengthFlags: ["fallback_only"] as const,
      rawEvidence: {
        snapshotField: "retargeting_pixel_detected",
        value: true
      },
      expected: {
        allowedNarrativeTier: "weak",
        promotionEligibility: "internal_only",
        externalSurfacingEligibility: "audit_only",
        negativeEvidenceFlags: ["no_direct_runtime_retargeting_artifact_observed"]
      }
    },
    {
      name: "dsar with fetched high-confidence evidence stays eligible",
      concern: makeConcern({
        originKey: "section_review.missing_dsar_high_exposure",
        suggestedUnifiedFindingId: "missing_dsar_high_exposure",
        title: "Possible missing privacy-rights path"
      }),
      evidenceStrengthFlags: ["policy_text", "page_attributed"] as const,
      rawEvidence: {
        policyDsarMechanism: "absent",
        policyExtractionStatus: "fetched",
        policyRightsSignals: [],
        policySemanticConfidence: 0.8
      },
      expected: {
        allowedNarrativeTier: "moderate",
        promotionEligibility: "eligible",
        externalSurfacingEligibility: "eligible",
        negativeEvidenceFlags: ["policy_target_retrievable"]
      }
    },
    {
      name: "gpc ignored with zero retained delta stays internal",
      concern: makeConcern({
        originKey: "privacy.gpc_signal_not_honored",
        suggestedUnifiedFindingId: "gpc_signal_not_honored",
        title: "GPC signal not honored"
      }),
      evidenceStrengthFlags: ["fallback_only"] as const,
      rawEvidence: {
        baselineThirdPartyCookieCount: 24,
        gpcThirdPartyCookieCount: 24,
        thirdPartyCookieCountDelta: 0,
        trackerCountDelta: 0
      },
      expected: {
        allowedNarrativeTier: "weak",
        promotionEligibility: "internal_only",
        externalSurfacingEligibility: "audit_only",
        negativeEvidenceFlags: []
      }
    },
    {
      name: "gpc ignored with delta but no reviewer-visible support stays audit-only",
      concern: makeConcern({
        originKey: "privacy.gpc_signal_not_honored",
        suggestedUnifiedFindingId: "gpc_signal_not_honored",
        title: "GPC signal not honored"
      }),
      evidenceStrengthFlags: ["fallback_only"] as const,
      rawEvidence: {
        baselineThirdPartyCookieCount: 6,
        gpcThirdPartyCookieCount: 8,
        thirdPartyCookieCountDelta: 2,
        trackerCountDelta: 0
      },
      expected: {
        allowedNarrativeTier: "weak",
        promotionEligibility: "internal_only",
        externalSurfacingEligibility: "audit_only",
        negativeEvidenceFlags: []
      }
    },
    {
      name: "gpc ignored with delta and gpc disclosure support stays eligible",
      concern: makeConcern({
        originKey: "privacy.gpc_signal_not_honored",
        suggestedUnifiedFindingId: "gpc_signal_not_honored",
        title: "GPC signal not honored"
      }),
      evidenceStrengthFlags: ["fallback_only"] as const,
      rawEvidence: {
        baselineThirdPartyCookieCount: 6,
        gpcThirdPartyCookieCount: 8,
        thirdPartyCookieCountDelta: 2,
        trackerCountDelta: 0,
        gpcDisclosurePresent: true
      },
      expected: {
        allowedNarrativeTier: "strong",
        promotionEligibility: "eligible",
        externalSurfacingEligibility: "eligible",
        negativeEvidenceFlags: []
      }
    },
    {
      name: "consent surface missing without concrete absence evidence stays audit-only",
      concern: makeConcern({
        originKey: "privacy.consent_surface_missing",
        suggestedUnifiedFindingId: "consent_surface_missing",
        title: "Consent surface missing"
      }),
      evidenceStrengthFlags: ["fallback_only"] as const,
      rawEvidence: {
        keyPageAttemptCount: 3,
        keyPageDiscoverySource: "footer_link"
      },
      expected: {
        allowedNarrativeTier: "weak",
        promotionEligibility: "internal_only",
        externalSurfacingEligibility: "audit_only",
        negativeEvidenceFlags: []
      }
    },
    {
      name: "structured policy disclosure gaps are blocked when extraction was incomplete",
      concern: makeConcern({
        originKey: "policySemanticConfidence",
        originType: "policy_enrichment",
        policyPageType: "privacy_policy",
        suggestedUnifiedFindingId: "data_categories_disclosure_missing",
        title: "Policy semantic confidence"
      }),
      evidenceStrengthFlags: ["policy_text", "page_attributed"] as const,
      rawEvidence: {
        pageType: "privacy_policy",
        policyCoverageRatio: 0.7,
        policyExtractionStatus: "parser_incomplete",
        policySemanticConfidence: 0.85
      },
      expected: {
        allowedNarrativeTier: "weak",
        promotionEligibility: "blocked",
        externalSurfacingEligibility: "suppress",
        negativeEvidenceFlags: ["policy_target_parsing_incomplete"]
      }
    },
    {
      name: "structured policy disclosure gaps with fetched high-confidence evidence stay eligible",
      concern: makeConcern({
        originKey: "policySemanticConfidence",
        originType: "policy_enrichment",
        policyPageType: "privacy_policy",
        suggestedUnifiedFindingId: "third_party_recipient_disclosure_missing",
        title: "Policy semantic confidence"
      }),
      evidenceStrengthFlags: ["policy_text", "page_attributed"] as const,
      rawEvidence: {
        pageType: "privacy_policy",
        policyCoverageRatio: 0.67,
        policyExtractionStatus: "fetched",
        policySemanticConfidence: 0.81
      },
      expected: {
        allowedNarrativeTier: "moderate",
        promotionEligibility: "eligible",
        externalSurfacingEligibility: "eligible",
        negativeEvidenceFlags: []
      }
    },
    {
      name: "structured purpose-of-use gaps with fetched high-confidence evidence stay eligible",
      concern: makeConcern({
        originKey: "policySemanticConfidence",
        originType: "policy_enrichment",
        policyPageType: "privacy_policy",
        suggestedUnifiedFindingId: "purpose_of_use_disclosure_missing",
        title: "Policy semantic confidence"
      }),
      evidenceStrengthFlags: ["policy_text", "page_attributed"] as const,
      rawEvidence: {
        pageType: "privacy_policy",
        policyCoverageRatio: 0.66,
        policyExtractionStatus: "fetched",
        policySemanticConfidence: 0.8
      },
      expected: {
        allowedNarrativeTier: "moderate",
        promotionEligibility: "eligible",
        externalSurfacingEligibility: "eligible",
        negativeEvidenceFlags: []
      }
    },
    {
      name: "thin single-cookie attribute evidence stays internal",
      concern: makeConcern({
        originKey: "privacy.weak_cookie_security_attributes_detected",
        suggestedUnifiedFindingId: "weak_cookie_security_attributes",
        title: "Weak cookie security attributes"
      }),
      evidenceStrengthFlags: ["fallback_only"] as const,
      rawEvidence: {
        missingHttpOnlyCount: 1,
        missingSecureCount: 1,
        thirdPartyWeakAttributeCount: 0,
        totalCookiesAnalyzed: 1,
        weakSameSiteCount: 0
      },
      expected: {
        allowedNarrativeTier: "weak",
        promotionEligibility: "internal_only",
        externalSurfacingEligibility: "audit_only",
        negativeEvidenceFlags: []
      }
    },
    {
      name: "commercial finding without retained evidence stays internal",
      concern: makeConcern({
        originKey: "commerce.limited_time_offer_language_present",
        suggestedUnifiedFindingId: "limited_time_pressure",
        title: "Limited-time pressure"
      }),
      evidenceStrengthFlags: ["fallback_only"] as const,
      rawEvidence: {
        signalKey: "commerce.limited_time_offer_language_present",
        signalValue: true
      },
      expected: {
        allowedNarrativeTier: "weak",
        promotionEligibility: "internal_only",
        externalSurfacingEligibility: "audit_only",
        negativeEvidenceFlags: []
      }
    },
    {
      name: "raw high-risk financial product signal without offer context is blocked",
      concern: makeConcern({
        originKey: "financial.options_or_futures_language_present",
        suggestedUnifiedFindingId: "leveraged_or_high_risk_product_promotion",
        title: "Options or futures language present"
      }),
      evidenceStrengthFlags: ["fallback_only"] as const,
      rawEvidence: {
        signalKey: "financial.options_or_futures_language_present",
        signalLabel: "Options or futures language present",
        signalValue: true
      },
      expected: {
        allowedNarrativeTier: "weak",
        promotionEligibility: "blocked",
        externalSurfacingEligibility: "suppress",
        negativeEvidenceFlags: []
      }
    },
    {
      name: "raw high-risk financial product signal with offer context stays eligible",
      concern: makeConcern({
        originKey: "financial.options_or_futures_language_present",
        suggestedUnifiedFindingId: "leveraged_or_high_risk_product_promotion",
        title: "Options or futures language present"
      }),
      evidenceStrengthFlags: ["fallback_only", "page_attributed", "policy_text"] as const,
      rawEvidence: {
        matchedSnippet: "Trade options and futures with margin on our professional investing platform.",
        pageClassification: "financial_offer",
        pageType: "financial_offer",
        pageUrl: "https://example.com/trading/options",
        signalKey: "financial.options_or_futures_language_present",
        signalLabel: "Options or futures language present",
        signalValue: true
      },
      expected: {
        allowedNarrativeTier: "strong",
        promotionEligibility: "eligible",
        externalSurfacingEligibility: "eligible",
        negativeEvidenceFlags: []
      }
    },
    {
      name: "domain-level minors context without retained page evidence stays internal",
      concern: makeConcern({
        originKey: "privacy.minors_or_age_gated_collection_context",
        suggestedUnifiedFindingId: "minors_or_age_gated_collection_context",
        title: "Minors or age-gated collection context"
      }),
      evidenceStrengthFlags: ["fallback_only"] as const,
      rawEvidence: {
        childrenPrivacyRiskScore: 15,
        mentionsUnder13: true
      },
      expected: {
        allowedNarrativeTier: "weak",
        promotionEligibility: "internal_only",
        externalSurfacingEligibility: "audit_only",
        negativeEvidenceFlags: []
      }
    },
    {
      name: "coverage gap missing surface without corroborating discovery stays audit-only",
      concern: makeConcern({
        originKey: "disclosure.privacy_policy_surface_missing",
        suggestedUnifiedFindingId: "privacy_policy_missing_surface",
        title: "Privacy policy missing"
      }),
      evidenceStrengthFlags: ["fallback_only"] as const,
      rawEvidence: {
        privacyPolicyPresent: false
      },
      expected: {
        allowedNarrativeTier: "weak",
        promotionEligibility: "internal_only",
        externalSurfacingEligibility: "audit_only",
        negativeEvidenceFlags: []
      }
    },
    {
      name: "coverage gap missing surface with corroborated discovery stays eligible",
      concern: makeConcern({
        originKey: "disclosure.privacy_policy_surface_missing",
        suggestedUnifiedFindingId: "privacy_policy_missing_surface",
        title: "Privacy policy missing"
      }),
      evidenceStrengthFlags: ["fallback_only", "key_page_discovery", "page_attributed"] as const,
      rawEvidence: {
        keyPageAttemptCount: 2,
        keyPageAttemptedUrls: ["https://example.com/privacy", "https://example.com/privacy-policy"],
        keyPageDiscoverySource: "footer_link",
        privacyPolicyPresent: false
      },
      expected: {
        allowedNarrativeTier: "strong",
        promotionEligibility: "eligible",
        externalSurfacingEligibility: "eligible",
        negativeEvidenceFlags: []
      }
    },
    {
      name: "financial fee disclosure with retained snippet and url stays eligible but conservative",
      concern: makeConcern({
        originKey: "commercial.explicit_fee_disclosure_text_present",
        suggestedUnifiedFindingId: "fee_disclosure_present",
        title: "Fee disclosure present"
      }),
      evidenceStrengthFlags: ["fallback_only", "page_attributed"] as const,
      rawEvidence: {
        matchedSnippet: "A monthly fee of $25 applies to premium managed accounts.",
        pageUrl: "https://example.com/pricing",
        signalKey: "commercial.explicit_fee_disclosure_text_present"
      },
      expected: {
        allowedNarrativeTier: "moderate",
        promotionEligibility: "eligible",
        externalSurfacingEligibility: "eligible",
        negativeEvidenceFlags: []
      }
    },
    {
      name: "financial fee disclosure without a retained user-facing url stays audit-only",
      concern: makeConcern({
        originKey: "commercial.explicit_fee_disclosure_text_present",
        suggestedUnifiedFindingId: "fee_disclosure_present",
        title: "Fee disclosure present"
      }),
      evidenceStrengthFlags: ["fallback_only"] as const,
      rawEvidence: {
        matchedSnippet: "A monthly fee of $25 applies to premium managed accounts.",
        signalKey: "commercial.explicit_fee_disclosure_text_present"
      },
      expected: {
        allowedNarrativeTier: "weak",
        promotionEligibility: "internal_only",
        externalSurfacingEligibility: "audit_only",
        negativeEvidenceFlags: []
      }
    },
    {
      name: "contact support path with blocked interstitial evidence stays audit-only",
      concern: makeConcern({
        originKey: "disclosure.contact_page_present",
        suggestedUnifiedFindingId: "contact_support_path_present",
        title: "Contact page fetched"
      }),
      evidenceStrengthFlags: ["fallback_only", "page_attributed", "policy_text"] as const,
      rawEvidence: {
        pageUrl: "https://www.example.com/contact",
        policySnippets: [
          "We’re sorry, but we were unable to authorize your request. Please call us at 800-555-1212."
        ]
      },
      expected: {
        allowedNarrativeTier: "weak",
        promotionEligibility: "internal_only",
        externalSurfacingEligibility: "audit_only",
        negativeEvidenceFlags: [
          "blocked_or_interstitial_evidence_observed",
          "positive_surface_content_unverified"
        ]
      }
    },
    {
      name: "packet-backed corroborated contact surfaces can still surface without a readable snippet",
      concern: makeConcern({
        originKey: "disclosure.contact_page_present",
        suggestedUnifiedFindingId: "contact_support_path_present",
        title: "Contact page fetched"
      }),
      evidenceStrengthFlags: ["fallback_only", "page_attributed"] as const,
      rawEvidence: {
        familyPacketFamilyId: "support_access",
        familyPacketFindingId: "contact_support_path_present",
        familyPacketVerified: true,
        pageUrls: ["https://www.example.com/contact", "https://www.example.com/contact-us"],
        sourceUrls: ["https://www.example.com/contact", "https://www.example.com/contact-us"],
        fetchQuality: "blocked_interstitial",
        policySnippets: ["Example Corp"]
      },
      expected: {
        allowedNarrativeTier: "moderate",
        promotionEligibility: "eligible",
        externalSurfacingEligibility: "eligible",
        negativeEvidenceFlags: []
      }
    },
    {
      name: "packet-backed privacy policy surfaces stay eligible with corroborated page evidence under partial capture",
      concern: makeConcern({
        originKey: "disclosure.privacy_policy_present",
        suggestedUnifiedFindingId: "privacy_policy_present",
        title: "Privacy policy fetched"
      }),
      evidenceStrengthFlags: ["fallback_only", "page_attributed"] as const,
      rawEvidence: {
        familyPacketFamilyId: "policies",
        familyPacketFindingId: "privacy_policy_present",
        pageUrls: ["https://www.schwab.com/legal/privacy/us-residents"],
        sourceUrls: ["https://www.schwab.com/legal/privacy/us-residents"],
        fetchQuality: "thin_content",
        policySnippets: ["Privacy Notice for United States Residents"]
      },
      expected: {
        allowedNarrativeTier: "moderate",
        promotionEligibility: "eligible",
        externalSurfacingEligibility: "eligible",
        negativeEvidenceFlags: []
      }
    },
    {
      name: "packet-backed GPC disclosures stay eligible with corroborated policy evidence",
      concern: makeConcern({
        originKey: "privacy.gpc_disclosure_present",
        originType: "policy_enrichment",
        policyPageType: "privacy_policy",
        suggestedUnifiedFindingId: "gpc_disclosure_present",
        title: "GPC handling disclosed"
      }),
      evidenceStrengthFlags: ["policy_text", "page_attributed"] as const,
      rawEvidence: {
        familyPacketFamilyId: "policy_notice",
        familyPacketFindingId: "gpc_disclosure_present",
        pageUrl: "https://www.schwab.com/legal/privacy/us-residents",
        sourceUrls: ["https://www.schwab.com/legal/privacy/us-residents"],
        fetchQuality: "thin_content",
        policySnippets: ["If your browser communicates an opt-out preference signal, we will honor that signal."]
      },
      expected: {
        allowedNarrativeTier: "moderate",
        promotionEligibility: "eligible",
        externalSurfacingEligibility: "eligible",
        negativeEvidenceFlags: []
      }
    },
    {
      name: "packet-backed accessibility support surfaces stay eligible with corroborated domain evidence",
      concern: makeConcern({
        originKey: "accessibility.accessibility_contact_method_present",
        suggestedUnifiedFindingId: "accessibility_support_path_present",
        title: "Accessibility support path present"
      }),
      evidenceStrengthFlags: ["fallback_only", "page_attributed"] as const,
      rawEvidence: {
        familyPacketFamilyId: "support_access",
        familyPacketFindingId: "accessibility_support_path_present",
        pageUrls: ["https://www.schwab.com/legal/accessibility-help"],
        sourceUrls: ["https://www.schwab.com/legal/accessibility-help"],
        fetchQuality: "thin_content",
        policySnippets: ["Accessibility help center"],
        accessibilityContactMethodPresent: false
      },
      expected: {
        allowedNarrativeTier: "moderate",
        promotionEligibility: "eligible",
        externalSurfacingEligibility: "eligible",
        negativeEvidenceFlags: []
      }
    },
    {
      name: "pre-consent tracking without concrete artifacts stays audit-only",
      concern: makeConcern({
        originKey: "privacy.preconsent_tracking_detected",
        suggestedUnifiedFindingId: "preconsent_tracking",
        title: "Pre-consent tracking detected"
      }),
      evidenceStrengthFlags: ["fallback_only"] as const,
      rawEvidence: {
        signalValue: true
      },
      expected: {
        allowedNarrativeTier: "weak",
        promotionEligibility: "internal_only",
        externalSurfacingEligibility: "audit_only",
        negativeEvidenceFlags: [
          "missing_concrete_preconsent_artifact",
          "missing_preconsent_sequence_evidence"
        ]
      }
    },
    {
      name: "bounded key-page discovery unresolved is blocked when stable linked discovery already retained privacy, terms, and contact coverage",
      concern: makeConcern({
        originKey: "disclosure.key_page_discovery_unresolved_after_bounded_search",
        suggestedUnifiedFindingId: "bounded_key_page_discovery_unresolved",
        title: "Bounded key-page discovery unresolved"
      }),
      evidenceStrengthFlags: ["key_page_discovery", "page_attributed"] as const,
      rawEvidence: {
        contactPagePresent: true,
        keyPageAttemptCount: 4,
        keyPageDiscoverySource: "footer_link",
        privacyPolicyPresent: true,
        termsOfServicePresent: true
      },
      expected: {
        allowedNarrativeTier: "weak",
        promotionEligibility: "blocked",
        externalSurfacingEligibility: "suppress",
        negativeEvidenceFlags: []
      }
    },
    {
      name: "bounded key-page discovery unresolved is blocked when stable linked discovery already retained privacy, terms, and affiliate coverage",
      concern: makeConcern({
        originKey: "disclosure.key_page_discovery_unresolved_after_bounded_search",
        suggestedUnifiedFindingId: "bounded_key_page_discovery_unresolved",
        title: "Bounded key-page discovery unresolved"
      }),
      evidenceStrengthFlags: ["key_page_discovery", "page_attributed"] as const,
      rawEvidence: {
        affiliateDisclosurePresent: true,
        keyPageAttemptCount: 3,
        keyPageDiscoverySource: "footer_link",
        privacyPolicyPresent: true,
        termsOfServicePresent: true
      },
      expected: {
        allowedNarrativeTier: "weak",
        promotionEligibility: "blocked",
        externalSurfacingEligibility: "suppress",
        negativeEvidenceFlags: []
      }
    },
    {
      name: "bounded key-page discovery unresolved stays audit-only even when unresolved evidence remains",
      concern: makeConcern({
        originKey: "disclosure.key_page_discovery_unresolved_after_bounded_search",
        suggestedUnifiedFindingId: "bounded_key_page_discovery_unresolved",
        title: "Bounded key-page discovery unresolved"
      }),
      evidenceStrengthFlags: ["key_page_discovery", "page_attributed"] as const,
      rawEvidence: {
        keyPageAttemptCount: 2,
        keyPageAttemptedUrls: ["https://example.com/contact", "https://example.com/contact-us"]
      },
      expected: {
        allowedNarrativeTier: "weak",
        promotionEligibility: "internal_only",
        externalSurfacingEligibility: "audit_only",
        negativeEvidenceFlags: []
      }
    },
    {
      name: "rights friction without a real barrier is blocked",
      concern: makeConcern({
        originKey: "privacy.user_rights_friction_score",
        suggestedUnifiedFindingId: "functional_misalignment",
        title: "Functional misalignment"
      }),
      evidenceStrengthFlags: ["fallback_only"] as const,
      rawEvidence: {
        consentEvidencePassCount: 1
      },
      expected: {
        allowedNarrativeTier: "weak",
        promotionEligibility: "blocked",
        externalSurfacingEligibility: "suppress",
        negativeEvidenceFlags: ["runtime_tracking_review_incomplete", "possible_policy_runtime_mismatch"]
      }
    },
    {
      name: "rights friction with thin preference-center evidence stays blocked when rights path exists",
      concern: makeConcern({
        originKey: "privacy.user_rights_friction_score",
        suggestedUnifiedFindingId: "rights_fulfillment_friction",
        title: "Rights fulfillment friction"
      }),
      evidenceStrengthFlags: ["fallback_only", "page_attributed", "policy_text"] as const,
      rawEvidence: {
        consentOptOutClicks: 2,
        consentRedirectOrAuthRequired: true,
        consentBlockerTextSnippet:
          "Allow Sale, Sharing for Cross-Context Behavioral Advertising, or Targeted Advertising Save Settings",
        consentEvidencePassCount: 1,
        policyRightsSignals: ["access", "delete", "privacy_controls"]
      },
      expected: {
        allowedNarrativeTier: "weak",
        promotionEligibility: "blocked",
        externalSurfacingEligibility: "suppress",
        negativeEvidenceFlags: ["runtime_tracking_review_incomplete", "possible_policy_runtime_mismatch"]
      }
    },
    {
      name: "weak cookie posture without concrete secure or samesite examples stays audit-only",
      concern: makeConcern({
        originKey: "privacy.weak_cookie_security_attributes_detected",
        suggestedUnifiedFindingId: "weak_cookie_security_attributes",
        title: "Weak cookie security attributes"
      }),
      evidenceStrengthFlags: ["direct_runtime"] as const,
      rawEvidence: {
        cookieAttributeSummary: {
          missingHttpOnlyCount: 4,
          missingHttpOnlyCookieNames: ["_ga", "_ga_test"]
        }
      },
      expected: {
        allowedNarrativeTier: "weak",
        promotionEligibility: "internal_only",
        externalSurfacingEligibility: "audit_only",
        negativeEvidenceFlags: []
      }
    },
    {
      name: "high-sensitivity concern with request evidence stays eligible",
      concern: makeConcern({
        originKey: "commerce.high_sensitivity_data_collection_detected",
        suggestedUnifiedFindingId: "high_sensitivity_data_collection",
        title: "High-sensitivity data collection detected"
      }),
      evidenceStrengthFlags: ["concrete_payload", "page_attributed"] as const,
      rawEvidence: {
        sensitivePayloadViolations: [
          {
            evidenceStrength: "suspected",
            requestUrl: "https://tracker.example.com/collect"
          }
        ]
      },
      expected: {
        allowedNarrativeTier: "strong",
        promotionEligibility: "eligible",
        externalSurfacingEligibility: "eligible",
        negativeEvidenceFlags: []
      }
    },
    {
      name: "sensitive replay concern without sensitive payload evidence stays audit-only",
      concern: makeConcern({
        originKey: "commerce.high_sensitivity_data_collection_detected",
        suggestedUnifiedFindingId: "session_replay_on_sensitive_input_surface",
        title: "Sensitive replay detected"
      }),
      evidenceStrengthFlags: ["direct_runtime"] as const,
      rawEvidence: {
        session_replay_runtime_artifacts: ["vendor:Microsoft Clarity|host:clarity.ms"]
      },
      expected: {
        allowedNarrativeTier: "weak",
        promotionEligibility: "internal_only",
        externalSurfacingEligibility: "audit_only",
        negativeEvidenceFlags: ["missing_concrete_sensitive_payload"]
      }
    },
    {
      name: "sensitive replay concern with payload and replay evidence stays eligible",
      concern: makeConcern({
        originKey: "commerce.high_sensitivity_data_collection_detected",
        suggestedUnifiedFindingId: "session_replay_on_sensitive_input_surface",
        title: "Sensitive replay detected"
      }),
      evidenceStrengthFlags: ["direct_runtime", "concrete_payload"] as const,
      rawEvidence: {
        sensitivePayloadViolations: [
          {
            evidenceStrength: "suspected",
            requestUrl: "https://collector.example.com/submit"
          }
        ],
        session_replay_runtime_artifacts: ["vendor:Microsoft Clarity|host:clarity.ms"]
      },
      expected: {
        allowedNarrativeTier: "moderate",
        promotionEligibility: "eligible",
        externalSurfacingEligibility: "eligible",
        negativeEvidenceFlags: []
      }
    },
    {
      name: "sensitive tracking concern without retained tracker artifacts stays audit-only",
      concern: makeConcern({
        originKey: "commerce.high_sensitivity_data_collection_detected",
        suggestedUnifiedFindingId: "sensitive_data_collection_with_third_party_tracking_present",
        title: "Sensitive data collection with third-party tracking present"
      }),
      evidenceStrengthFlags: ["concrete_payload"] as const,
      rawEvidence: {
        sensitivePayloadViolations: [
          {
            evidenceStrength: "suspected",
            requestUrl: "https://collector.example.com/submit"
          }
        ]
      },
      expected: {
        allowedNarrativeTier: "weak",
        promotionEligibility: "internal_only",
        externalSurfacingEligibility: "audit_only",
        negativeEvidenceFlags: ["missing_third_party_tracking_artifact"]
      }
    },
    {
      name: "unattributed accessibility concerns become audit-only",
      concern: makeConcern({
        originType: "validation_rule",
        originKey: "scan_snapshot.accessibility.accessibility_risk_score",
        suggestedUnifiedFindingId: "accessibility_risk_score",
        title: "Accessibility risk score"
      }),
      evidenceStrengthFlags: ["structured_validation"] as const,
      rawEvidence: {
        value: -4
      },
      expected: {
        allowedNarrativeTier: "weak",
        promotionEligibility: "internal_only",
        externalSurfacingEligibility: "audit_only",
        negativeEvidenceFlags: []
      }
    },
    {
      name: "page-attributed accessibility score without axe examples stays audit-only",
      concern: makeConcern({
        originType: "validation_rule",
        originKey: "scan_snapshot.accessibility.accessibility_risk_score",
        suggestedUnifiedFindingId: "accessibility_risk_score",
        title: "Accessibility risk score"
      }),
      evidenceStrengthFlags: ["structured_validation", "page_attributed"] as const,
      rawEvidence: ADA_ACCESSIBILITY_FIXTURES.scoreOnlySnapshot,
      expected: {
        allowedNarrativeTier: "weak",
        promotionEligibility: "internal_only",
        externalSurfacingEligibility: "audit_only",
        negativeEvidenceFlags: []
      }
    },
    {
      name: "page-attributed accessibility score with one moderate axe example stays audit-only",
      concern: makeConcern({
        originType: "validation_rule",
        originKey: "scan_snapshot.accessibility.accessibility_risk_score",
        suggestedUnifiedFindingId: "accessibility_risk_score",
        title: "Accessibility risk score"
      }),
      evidenceStrengthFlags: ["structured_validation", "page_attributed"] as const,
      rawEvidence: ADA_ACCESSIBILITY_FIXTURES.singleModerateAxeExample,
      expected: {
        allowedNarrativeTier: "weak",
        promotionEligibility: "internal_only",
        externalSurfacingEligibility: "audit_only",
        negativeEvidenceFlags: []
      }
    },
    {
      name: "page-attributed accessibility score with serious axe example can promote",
      concern: makeConcern({
        originType: "validation_rule",
        originKey: "scan_snapshot.accessibility.accessibility_risk_score",
        suggestedUnifiedFindingId: "accessibility_risk_score",
        title: "Accessibility risk score"
      }),
      evidenceStrengthFlags: ["structured_validation", "page_attributed"] as const,
      rawEvidence: ADA_ACCESSIBILITY_FIXTURES.seriousAxeExample,
      expected: {
        allowedNarrativeTier: "strong",
        promotionEligibility: "eligible",
        externalSurfacingEligibility: "eligible",
        negativeEvidenceFlags: []
      }
    },
    {
      name: "page-attributed accessibility score with multi-page axe coverage can promote",
      concern: makeConcern({
        originType: "validation_rule",
        originKey: "scan_snapshot.accessibility.accessibility_risk_score",
        suggestedUnifiedFindingId: "accessibility_risk_score",
        title: "Accessibility risk score"
      }),
      evidenceStrengthFlags: ["structured_validation", "page_attributed"] as const,
      rawEvidence: ADA_ACCESSIBILITY_FIXTURES.multiRuleAxeExamples,
      expected: {
        allowedNarrativeTier: "strong",
        promotionEligibility: "eligible",
        externalSurfacingEligibility: "eligible",
        negativeEvidenceFlags: []
      }
    },
    {
      name: "guessed-only unavailable coverage stays audit-only without a linked discovery path",
      concern: makeConcern({
        originKey: "disclosure.cookie_policy_fetch_failed",
        suggestedUnifiedFindingId: "cookie_policy_unavailable",
        title: "Cookie policy unavailable"
      }),
      evidenceStrengthFlags: ["fallback_only", "key_page_discovery"] as const,
      rawEvidence: {
        keyPageAttemptCount: 2,
        keyPageAttemptedUrls: ["https://example.com/cookies", "https://example.com/legal/cookies"],
        keyPageGuessedOnly: true
      },
      expected: {
        allowedNarrativeTier: "weak",
        promotionEligibility: "internal_only",
        externalSurfacingEligibility: "audit_only",
        negativeEvidenceFlags: []
      }
    }
  ];

  for (const testCase of cases) {
    const policy = deriveConcernPolicy({
      concern: testCase.concern,
      evidenceStrengthFlags: [...testCase.evidenceStrengthFlags],
      rawEvidence: testCase.rawEvidence
    });

    assert.deepEqual(policy, testCase.expected, testCase.name);
  }
});

test("concern policy helper primitives stay aligned with packet usage", () => {
  assert.equal(
    concernRequiresDirectRuntime(
      makeConcern({
        suggestedUnifiedFindingId: "session_replay_undisclosed",
        title: "Possible replay/disclosure mismatch"
      })
    ),
    true
  );
  assert.equal(
    concernRequiresPageAttribution(
      makeConcern({
        suggestedUnifiedFindingId: "accessibility_risk_score"
      })
    ),
    true
  );
  assert.equal(isDomainLevelSensitiveContextFinding("minors_or_age_gated_collection_context"), true);
  assert.equal(
    isDomainLevelChildrenDisclosureFinding("children_privacy_context_without_supporting_disclosure"),
    true
  );
  assert.equal(
    packetNeedsPageAttribution({
      family: "contradiction",
      unifiedFindingId: "policy_behavior_conflict"
    }),
    true
  );
  assert.equal(
    packetNeedsPageAttribution({
      family: "consent_tracking",
      unifiedFindingId: "consent_surface_missing"
    }),
    false
  );
});

test("deriveConcernPolicy weakens contradiction concerns when one side of the mismatch is missing", () => {
  const policy = deriveConcernPolicy({
    concern: makeConcern({
      originKey: "context.policy_behavior_conflict_detected",
      suggestedUnifiedFindingId: "policy_behavior_conflict",
      title: "Policy/behavior conflict detected"
    }),
    evidenceStrengthFlags: ["fallback_only"],
    rawEvidence: {
      signalValue: true
    }
  });

  assert.deepEqual(policy, {
    allowedNarrativeTier: "weak",
    promotionEligibility: "internal_only",
    externalSurfacingEligibility: "audit_only",
    negativeEvidenceFlags: [
      "missing_behavior_side_evidence",
      "missing_policy_side_evidence",
      "missing_contradiction_mapping",
      "missing_explicit_contradiction_basis",
      "insufficient_evidence_for_policy_behavior_conflict"
    ]
  });
});

test("deriveConcernPolicy keeps generic policy-behavior conflicts internal when no explicit contradiction basis is retained", () => {
  const policy = deriveConcernPolicy({
    concern: makeConcern({
      originKey: "context.policy_behavior_conflict_detected",
      suggestedUnifiedFindingId: "policy_behavior_conflict",
      title: "Policy/behavior conflict detected"
    }),
    evidenceStrengthFlags: ["policy_text", "direct_runtime"],
    rawEvidence: {
      claim: "Observed runtime behavior appears to conflict with policy representations about tracking or third-party data use.",
      policySnippet: "We describe advertising, pixels, and related privacy controls in the privacy policy.",
      runtimeEvidenceArtifacts: ["Google Ads"],
      supportingSignals: ["policy_behavior_conflict_candidate"]
    }
  });

  assert.deepEqual(policy, {
    allowedNarrativeTier: "weak",
    promotionEligibility: "internal_only",
    externalSurfacingEligibility: "audit_only",
    negativeEvidenceFlags: [
      "policy_semantic_review_incomplete",
      "missing_policy_side_evidence",
      "missing_specific_policy_anchor",
      "missing_behavior_side_evidence",
      "missing_specific_runtime_anchor",
      "runtime_tracking_review_incomplete",
      "missing_contradiction_mapping",
      "missing_explicit_contradiction_basis",
      "insufficient_evidence_for_policy_behavior_conflict",
      "possible_policy_runtime_mismatch"
    ]
  });
});

test("deriveConcernPolicy recognizes legacy contradiction evidence fields when checking missing sides", () => {
  const policy = deriveConcernPolicy({
    concern: makeConcern({
      originKey: "privacy.policy_runtime_functional_misalignment_detected",
      suggestedUnifiedFindingId: "privacy_cookie_policy_conflict",
      title: "Policy/runtime misalignment detected"
    }),
    evidenceStrengthFlags: ["fallback_only"],
    rawEvidence: {
      policy_summary_short: "We describe advertising, pixels, and related privacy controls in the privacy policy.",
      runtime_evidence_artifacts: ["Google Ads"],
      supportingSignals: ["policy_behavior_conflict_candidate"]
    }
  });

  assert.ok(!policy.negativeEvidenceFlags.includes("missing_policy_side_evidence"));
  assert.ok(!policy.negativeEvidenceFlags.includes("missing_behavior_side_evidence"));
});

test("deriveConcernPolicy promotes contradiction-grade policy behavior conflicts only with structured anchors and mapping", () => {
  const policy = deriveConcernPolicy({
    concern: makeConcern({
      originKey: "context.policy_behavior_conflict_detected",
      suggestedUnifiedFindingId: "policy_behavior_conflict",
      title: "Policy/behavior conflict detected"
    }),
    evidenceStrengthFlags: ["policy_text", "direct_runtime", "structured_validation"],
    rawEvidence: POLICY_BEHAVIOR_CONFLICT_FIXTURES.positiveGpcNotHonored
  });

  assert.deepEqual(policy, {
    allowedNarrativeTier: "strong",
    promotionEligibility: "eligible",
    externalSurfacingEligibility: "eligible",
    negativeEvidenceFlags: []
  });
});

test("deriveConcernPolicy fails closed for Schwab-like contradiction candidates without a contradiction pair", () => {
  const policy = deriveConcernPolicy({
    concern: makeConcern({
      originKey: "context.policy_behavior_conflict_detected",
      suggestedUnifiedFindingId: "policy_behavior_conflict",
      title: "Policy/behavior conflict detected"
    }),
    evidenceStrengthFlags: ["policy_text", "direct_runtime"],
    rawEvidence: POLICY_BEHAVIOR_CONFLICT_FIXTURES.negativeSchwabLike
  });

  assert.equal(policy.allowedNarrativeTier, "weak");
  assert.equal(policy.promotionEligibility, "internal_only");
  assert.equal(policy.externalSurfacingEligibility, "audit_only");
  assert.ok(policy.negativeEvidenceFlags.includes("insufficient_evidence_for_policy_behavior_conflict"));
  assert.ok(policy.negativeEvidenceFlags.includes("runtime_tracking_review_incomplete"));
});
