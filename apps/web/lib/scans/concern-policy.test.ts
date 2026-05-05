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
      name: "dsar accepts retained snake-case absence metadata",
      concern: makeConcern({
        originKey: "section_review.no_dsar_mechanism",
        suggestedUnifiedFindingId: "missing_dsar_mechanism",
        title: "No DSAR mechanism"
      }),
      evidenceStrengthFlags: ["policy_text", "page_attributed"] as const,
      rawEvidence: {
        policy_dsar_mechanism: "absent",
        policy_extraction_status: "fetched",
        policy_rights_signals: [],
        policy_semantic_confidence: 0.82,
        section_review_no_dsar_mechanism: true
      },
      expected: {
        allowedNarrativeTier: "moderate",
        promotionEligibility: "eligible",
        externalSurfacingEligibility: "eligible",
        negativeEvidenceFlags: ["policy_target_retrievable"]
      }
    },
    {
      name: "dsar absence is blocked when retained rights mechanism metadata exists",
      concern: makeConcern({
        originKey: "section_review.no_dsar_mechanism",
        suggestedUnifiedFindingId: "missing_dsar_mechanism",
        title: "No DSAR mechanism"
      }),
      evidenceStrengthFlags: ["policy_text", "page_attributed"] as const,
      rawEvidence: {
        policyDsarMechanism: "form",
        policyExtractionStatus: "fetched",
        policyRightsSignals: ["access_request", "delete_request"],
        policySemanticConfidence: 0.84,
        policySnippets: ["Submit a privacy request form to request access or deletion of your personal information."]
      },
      expected: {
        allowedNarrativeTier: "weak",
        promotionEligibility: "blocked",
        externalSurfacingEligibility: "suppress",
        negativeEvidenceFlags: ["policy_rights_language_observed", "policy_target_retrievable"]
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
      name: "security-sensitive weak cookie attribute evidence can promote",
      concern: makeConcern({
        originKey: "privacy.weak_cookie_security_attributes_detected",
        suggestedUnifiedFindingId: "weak_cookie_security_attributes",
        title: "Weak cookie security attributes"
      }),
      evidenceStrengthFlags: ["direct_runtime"] as const,
      rawEvidence: {
        cookieAttributeSummary: {
          missingSecureCount: 1,
          missingHttpOnlyCount: 1,
          missingSecureCookieNames: ["session_id"],
          missingHttpOnlyCookieNames: ["account_token"]
        }
      },
      expected: {
        allowedNarrativeTier: "strong",
        promotionEligibility: "eligible",
        externalSurfacingEligibility: "eligible",
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
      name: "raw high-risk financial product signal on finance domain stays eligible via macro enrichment",
      concern: makeConcern({
        originKey: "financial.options_or_futures_language_present",
        suggestedUnifiedFindingId: "leveraged_or_high_risk_product_promotion",
        title: "Options or futures language present"
      }),
      evidenceStrengthFlags: ["fallback_only"] as const,
      rawEvidence: {
        domainIndustryPrimary: "finance",
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
      name: "raw high-risk financial product signal on crypto domain stays eligible via macro enrichment",
      concern: makeConcern({
        originKey: "financial.perpetuals_or_derivatives_language_present",
        suggestedUnifiedFindingId: "leveraged_or_high_risk_product_promotion",
        title: "Perpetuals or derivatives language present"
      }),
      evidenceStrengthFlags: ["fallback_only"] as const,
      rawEvidence: {
        domainIndustryPrimary: "crypto",
        investorOrSecuritiesPromotion: true,
        signalKey: "financial.perpetuals_or_derivatives_language_present",
        signalLabel: "Perpetuals or derivatives language present",
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
      name: "options or futures signal on sportsbook is blocked",
      concern: makeConcern({
        originKey: "financial.options_or_futures_language_present",
        suggestedUnifiedFindingId: "leveraged_or_high_risk_product_promotion",
        title: "Options or futures language present"
      }),
      evidenceStrengthFlags: ["fallback_only", "page_attributed", "policy_text"] as const,
      rawEvidence: {
        matchedSnippet: "Explore betting options and NFL futures odds on our sportsbook.",
        pageClassification: "financial_offer",
        pageType: "financial_offer",
        pageUrl: "https://example.com/sportsbook",
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
      name: "perpetuals or derivatives signal on gambling site is blocked",
      concern: makeConcern({
        originKey: "financial.perpetuals_or_derivatives_language_present",
        suggestedUnifiedFindingId: "leveraged_or_high_risk_product_promotion",
        title: "Perpetuals or derivatives language present"
      }),
      evidenceStrengthFlags: ["fallback_only", "page_attributed", "policy_text"] as const,
      rawEvidence: {
        matchedSnippet: "Casino gaming with derivatives bonus bets and wagering options.",
        pageClassification: "financial_offer",
        pageType: "financial_offer",
        pageUrl: "https://example.com/casino",
        signalKey: "financial.perpetuals_or_derivatives_language_present",
        signalLabel: "Perpetuals or derivatives language present",
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
      name: "options signal with true financial derivatives context stays eligible",
      concern: makeConcern({
        originKey: "financial.options_or_futures_language_present",
        suggestedUnifiedFindingId: "leveraged_or_high_risk_product_promotion",
        title: "Options or futures language present"
      }),
      evidenceStrengthFlags: ["fallback_only", "page_attributed", "policy_text"] as const,
      rawEvidence: {
        matchedSnippet: "Trade equity options with strike price and expiry on our derivatives exchange.",
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
      name: "perpetuals signal with true financial derivatives context stays eligible",
      concern: makeConcern({
        originKey: "financial.perpetuals_or_derivatives_language_present",
        suggestedUnifiedFindingId: "leveraged_or_high_risk_product_promotion",
        title: "Perpetuals or derivatives language present"
      }),
      evidenceStrengthFlags: ["fallback_only", "page_attributed", "policy_text"] as const,
      rawEvidence: {
        matchedSnippet: "Perpetual swaps with underlying crypto assets and hedging on our derivatives market.",
        pageClassification: "financial_offer",
        pageType: "financial_offer",
        pageUrl: "https://example.com/trading/perps",
        signalKey: "financial.perpetuals_or_derivatives_language_present",
        signalLabel: "Perpetuals or derivatives language present",
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
      name: "options signal on daily fantasy sports is blocked",
      concern: makeConcern({
        originKey: "financial.options_or_futures_language_present",
        suggestedUnifiedFindingId: "leveraged_or_high_risk_product_promotion",
        title: "Options or futures language present"
      }),
      evidenceStrengthFlags: ["fallback_only", "page_attributed", "policy_text"] as const,
      rawEvidence: {
        matchedSnippet: "Player prop markets and parlay options for daily fantasy sports.",
        pageClassification: "financial_offer",
        pageType: "financial_offer",
        pageUrl: "https://example.com/fantasy",
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
      name: "options signal on CFTC-regulated prediction market stays eligible",
      concern: makeConcern({
        originKey: "financial.options_or_futures_language_present",
        suggestedUnifiedFindingId: "leveraged_or_high_risk_product_promotion",
        title: "Options or futures language present"
      }),
      evidenceStrengthFlags: ["fallback_only", "page_attributed", "policy_text"] as const,
      rawEvidence: {
        matchedSnippet: "Trade event contracts on economic and political outcomes. CFTC-regulated designated contract market.",
        pageClassification: "financial_offer",
        pageType: "financial_offer",
        pageUrl: "https://example.com/events",
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
      name: "section review high-risk product on gambling domain without offer evidence is blocked",
      concern: makeConcern({
        originKey: "section_review.high_risk_product_without_local_loss_risk_disclosure",
        originType: "section_review",
        suggestedUnifiedFindingId: "leveraged_or_high_risk_product_promotion",
        title: "High-risk gambling promotion disclosure review"
      }),
      evidenceStrengthFlags: ["fallback_only", "page_attributed"] as const,
      rawEvidence: {
        familyPacketFindingId: "leveraged_or_high_risk_product_promotion",
        matchedSnippet:
          "Sports betting or gambling context detected. High-risk product marketing should keep age eligibility, responsible-gambling help, bonus terms, and material offer restrictions close to promotional claims.",
        offerSnippets: [],
        pageClassification: "financial_offer",
        pageType: "financial_offer",
        pageUrl: "https://www.draftkings.com/",
        sectionReviewIssue: true,
        sensitive_context_label: "sports betting or gambling site",
        supportingSignals: [
          "financial.high_risk_product_promotion",
          "commercial.gambling_or_sportsbook_context_detected"
        ]
      },
      expected: {
        allowedNarrativeTier: "weak",
        promotionEligibility: "blocked",
        externalSurfacingEligibility: "suppress",
        negativeEvidenceFlags: []
      }
    },
    {
      name: "section review high-risk product on gambling domain with offer evidence stays eligible",
      concern: makeConcern({
        originKey: "section_review.high_risk_product_without_local_loss_risk_disclosure",
        originType: "section_review",
        suggestedUnifiedFindingId: "leveraged_or_high_risk_product_promotion",
        title: "High-risk gambling promotion disclosure review"
      }),
      evidenceStrengthFlags: ["fallback_only", "page_attributed", "policy_text"] as const,
      rawEvidence: {
        familyPacketFindingId: "leveraged_or_high_risk_product_promotion",
        matchedSnippet: "Get $1,000 in bonus bets when you sign up.",
        offerSnippets: ["Get $1,000 in bonus bets when you sign up."],
        pageClassification: "financial_offer",
        pageType: "financial_offer",
        pageUrl: "https://www.draftkings.com/",
        primaryOfferSnippet: "Get $1,000 in bonus bets when you sign up.",
        sectionReviewIssue: true,
        sensitive_context_label: "sports betting or gambling site",
        supportingSignals: [
          "financial.high_risk_product_promotion",
          "commercial.gambling_or_sportsbook_context_detected"
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
      name: "section review high-risk product on true financial exchange stays eligible",
      concern: makeConcern({
        originKey: "section_review.high_risk_product_without_local_loss_risk_disclosure",
        originType: "section_review",
        suggestedUnifiedFindingId: "leveraged_or_high_risk_product_promotion",
        title: "High-risk gambling promotion disclosure review"
      }),
      evidenceStrengthFlags: ["fallback_only", "page_attributed", "policy_text"] as const,
      rawEvidence: {
        familyPacketFindingId: "leveraged_or_high_risk_product_promotion",
        matchedSnippet: "Trade perpetual swaps with leverage on our derivatives exchange.",
        offerSnippets: ["Trade perpetual swaps with leverage on our derivatives exchange."],
        pageClassification: "financial_offer",
        pageType: "financial_offer",
        pageUrl: "https://www.kraken.com/",
        primaryOfferSnippet: "Trade perpetual swaps with leverage on our derivatives exchange.",
        sectionReviewIssue: true,
        sensitive_context_label: "sports betting or gambling site",
        supportingSignals: [
          "financial.high_risk_product_promotion",
          "commercial.gambling_or_sportsbook_context_detected"
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
      name: "validation leveraged product finding on media domain is suppressed via macro enrichment",
      concern: makeConcern({
        originKey: "financial_review.leveraged_or_high_risk_product_promotion",
        originType: "validation_rule",
        suggestedUnifiedFindingId: "leveraged_or_high_risk_product_promotion",
        title: "Leveraged or high-risk product promotion"
      }),
      evidenceStrengthFlags: ["structured_validation", "page_attributed"] as const,
      rawEvidence: {
        claimText: "Yield: 4 servings. Swap olive oil for butter.",
        domainIndustryPrimary: "media",
        matchedSnippet: "Yield: 4 servings. Swap olive oil for butter.",
        pageClassification: "financial_offer",
        pageType: "homepage",
        pageUrl: "https://www.foodnetwork.com/",
        signalKey: "financial.perpetuals_or_derivatives_language_present",
        sourceUrls: ["https://www.foodnetwork.com/"]
      },
      expected: {
        allowedNarrativeTier: "weak",
        promotionEligibility: "blocked",
        externalSurfacingEligibility: "suppress",
        negativeEvidenceFlags: ["missing_behavior_side_evidence"]
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
      name: "privacy rights positive with generic rights language stays audit-only",
      concern: makeConcern({
        originKey: "privacy.privacy_rights_path_present",
        suggestedUnifiedFindingId: "privacy_rights_path_present",
        title: "Privacy rights path present"
      }),
      evidenceStrengthFlags: ["fallback_only", "page_attributed", "policy_text"] as const,
      rawEvidence: {
        pageUrl: "https://example.com/privacy",
        policySnippets: ["You may have rights to access or delete your personal information depending on your location."],
        signalKey: "privacy.privacy_rights_path_present"
      },
      expected: {
        allowedNarrativeTier: "weak",
        promotionEligibility: "internal_only",
        externalSurfacingEligibility: "audit_only",
        negativeEvidenceFlags: ["positive_surface_content_unverified"]
      }
    },
    {
      name: "privacy rights positive with concrete request mechanism stays eligible",
      concern: makeConcern({
        originKey: "privacy.privacy_rights_path_present",
        suggestedUnifiedFindingId: "privacy_rights_path_present",
        title: "Privacy rights path present"
      }),
      evidenceStrengthFlags: ["fallback_only", "page_attributed", "policy_text"] as const,
      rawEvidence: {
        pageUrl: "https://example.com/privacy-rights",
        policySnippets: ["Submit a privacy request form to request access, deletion, or correction of your personal information."],
        signalKey: "privacy.privacy_rights_path_present"
      },
      expected: {
        allowedNarrativeTier: "moderate",
        promotionEligibility: "eligible",
        externalSurfacingEligibility: "eligible",
        negativeEvidenceFlags: []
      }
    },
    {
      name: "privacy rights positive with retained DSAR mechanism metadata stays eligible",
      concern: makeConcern({
        originKey: "privacy.privacy_rights_path_present",
        suggestedUnifiedFindingId: "privacy_rights_path_present",
        title: "Privacy rights path present"
      }),
      evidenceStrengthFlags: ["fallback_only", "page_attributed", "policy_text"] as const,
      rawEvidence: {
        pageUrl: "https://example.com/privacy",
        policyDsarMechanism: "present",
        policyRightsSignals: ["access", "delete"],
        policySnippets: ["We may need to confirm your identity before processing a privacy request."],
        signalKey: "privacy.privacy_rights_path_present"
      },
      expected: {
        allowedNarrativeTier: "moderate",
        promotionEligibility: "eligible",
        externalSurfacingEligibility: "eligible",
        negativeEvidenceFlags: []
      }
    },
    {
      name: "privacy contact positive with generic support contact stays audit-only",
      concern: makeConcern({
        originKey: "privacy.privacy_contact_path_present",
        suggestedUnifiedFindingId: "privacy_contact_path_present",
        title: "Privacy contact path present"
      }),
      evidenceStrengthFlags: ["fallback_only", "page_attributed", "policy_text"] as const,
      rawEvidence: {
        pageUrl: "https://example.com/contact",
        policySnippets: ["Contact our support team for help with your account."],
        signalKey: "privacy.privacy_contact_path_present"
      },
      expected: {
        allowedNarrativeTier: "weak",
        promotionEligibility: "internal_only",
        externalSurfacingEligibility: "audit_only",
        negativeEvidenceFlags: ["positive_surface_content_unverified", "missing_privacy_specific_contact_channel"]
      }
    },
    {
      name: "privacy contact positive with privacy-specific contact stays eligible",
      concern: makeConcern({
        originKey: "privacy.privacy_contact_path_present",
        suggestedUnifiedFindingId: "privacy_contact_path_present",
        title: "Privacy contact path present"
      }),
      evidenceStrengthFlags: ["fallback_only", "page_attributed", "policy_text"] as const,
      rawEvidence: {
        pageUrl: "https://example.com/privacy",
        policySnippets: ["Contact our privacy team at privacy@example.com for personal information requests."],
        signalKey: "privacy.privacy_contact_path_present"
      },
      expected: {
        allowedNarrativeTier: "moderate",
        promotionEligibility: "eligible",
        externalSurfacingEligibility: "eligible",
        negativeEvidenceFlags: []
      }
    },
    {
      name: "privacy contact positive with retained channel metadata and personal-information contact text stays eligible",
      concern: makeConcern({
        originKey: "privacy.privacy_contact_path_present",
        suggestedUnifiedFindingId: "privacy_contact_path_present",
        title: "Privacy contact path present"
      }),
      evidenceStrengthFlags: ["fallback_only", "page_attributed", "policy_text"] as const,
      rawEvidence: {
        pageUrl: "https://example.com/privacy",
        policySnippets: ["If you have questions about personal information you provided, select the Contact Us link."],
        privacyContactChannelType: "form",
        signalKey: "privacy.privacy_contact_path_present"
      },
      expected: {
        allowedNarrativeTier: "moderate",
        promotionEligibility: "eligible",
        externalSurfacingEligibility: "eligible",
        negativeEvidenceFlags: []
      }
    },
    {
      name: "tracking disclosure positive with retained topic snippet stays eligible without family packet backing",
      concern: makeConcern({
        originKey: "privacy.tracking_technologies_disclosure_present",
        suggestedUnifiedFindingId: "tracking_technologies_disclosure_present",
        title: "Tracking technologies disclosure present"
      }),
      evidenceStrengthFlags: ["fallback_only", "page_attributed", "policy_text"] as const,
      rawEvidence: {
        pageUrl: "https://example.com/privacy",
        policyPositiveSnippetKeys: ["topic:tracking_technologies_disclosure"],
        policyPositiveTopic: "tracking_technologies_disclosure",
        policySnippets: ["We use cookies, pixels, tags, and similar technologies to understand site usage."],
        signalKey: "privacy.tracking_technologies_disclosure_present"
      },
      expected: {
        allowedNarrativeTier: "moderate",
        promotionEligibility: "eligible",
        externalSurfacingEligibility: "eligible",
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
      name: "accessibility support path missing without bounded review evidence stays audit-only",
      concern: makeConcern({
        originKey: "accessibility.accessibility_support_path_missing",
        suggestedUnifiedFindingId: "accessibility_support_path_missing",
        title: "Accessibility support path missing"
      }),
      evidenceStrengthFlags: ["fallback_only"] as const,
      rawEvidence: {
        accessibilityContactMethodPresent: false,
        signalKey: "accessibility.accessibility_support_path_missing",
        signalValue: true
      },
      expected: {
        allowedNarrativeTier: "weak",
        promotionEligibility: "internal_only",
        externalSurfacingEligibility: "audit_only",
        negativeEvidenceFlags: ["missing_representative_accessibility_examples"]
      }
    },
    {
      name: "accessibility support path missing with bounded linked discovery can promote",
      concern: makeConcern({
        originKey: "accessibility.accessibility_support_path_missing",
        suggestedUnifiedFindingId: "accessibility_support_path_missing",
        title: "Accessibility support path missing"
      }),
      evidenceStrengthFlags: ["fallback_only", "key_page_discovery"] as const,
      rawEvidence: {
        accessibilityContactMethodPresent: false,
        accessibilityStatementPresent: false,
        keyPageAttemptCount: 3,
        keyPageAttemptedUrls: [
          "https://example.com/accessibility",
          "https://example.com/accessibility-statement",
          "https://example.com/contact"
        ],
        keyPageDiscoverySource: "footer_link",
        signalKey: "accessibility.accessibility_support_path_missing",
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
      name: "sale sharing controls missing without behavior anchor stays audit-only",
      concern: makeConcern({
        originKey: "privacy.sale_sharing_controls_missing",
        suggestedUnifiedFindingId: "sale_sharing_controls_missing",
        title: "Sale/sharing controls missing"
      }),
      evidenceStrengthFlags: ["fallback_only"] as const,
      rawEvidence: {
        doNotSellLinkPresent: false,
        signalKey: "privacy.sale_sharing_controls_missing",
        signalValue: true
      },
      expected: {
        allowedNarrativeTier: "weak",
        promotionEligibility: "internal_only",
        externalSurfacingEligibility: "audit_only",
        negativeEvidenceFlags: ["missing_policy_side_evidence"]
      }
    },
    {
      name: "sale sharing controls missing with policy behavior anchor can promote",
      concern: makeConcern({
        originKey: "privacy.sale_sharing_controls_missing",
        suggestedUnifiedFindingId: "sale_sharing_controls_missing",
        title: "Sale/sharing controls missing"
      }),
      evidenceStrengthFlags: ["fallback_only", "policy_text", "page_attributed"] as const,
      rawEvidence: {
        doNotSellLinkPresent: false,
        policyAnchor: {
          claimType: "targeted_advertising_without_control",
          sourceUrl: "https://example.com/privacy",
          snippet: "We share identifiers with advertising partners for targeted advertising."
        },
        signalKey: "privacy.sale_sharing_controls_missing",
        signalValue: true,
        targetedAdvertisingDisclosurePresent: true
      },
      expected: {
        allowedNarrativeTier: "strong",
        promotionEligibility: "eligible",
        externalSurfacingEligibility: "eligible",
        negativeEvidenceFlags: []
      }
    },
    {
      name: "high-sensitivity concern with request evidence stays eligible",
      concern: makeConcern({
        originKey: "commerce.high_sensitivity_data_collection_detected",
        suggestedUnifiedFindingId: "sensitive_data_collection_with_third_party_tracking_present",
        title: "Sensitive data collection with third-party tracking present"
      }),
      evidenceStrengthFlags: ["concrete_payload", "page_attributed"] as const,
      rawEvidence: {
        sensitivePayloadViolations: [
          {
            evidenceSource: "sensitive_field_third_party_tracking_correlation",
            evidenceStrength: "suspected",
            requestUrl: "https://tracker.example.com/collect",
            vendorHost: "tracker.example.com"
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
      name: "generic high-sensitivity signal without payload evidence is blocked",
      concern: makeConcern({
        originKey: "commerce.high_sensitivity_data_collection_detected",
        suggestedUnifiedFindingId: undefined,
        title: "High-sensitivity data collection detected"
      }),
      evidenceStrengthFlags: ["fallback_only"] as const,
      rawEvidence: {
        signalKey: "commerce.high_sensitivity_data_collection_detected",
        signalValue: true
      },
      expected: {
        allowedNarrativeTier: "weak",
        promotionEligibility: "blocked",
        externalSurfacingEligibility: "suppress",
        negativeEvidenceFlags: ["missing_specific_runtime_anchor", "runtime_tracking_review_incomplete"]
      }
    },
    ...[
      ["commerce.form_collects_ssn", "SSN collection detected"],
      ["commerce.form_collects_government_id", "Government ID collection detected"],
      ["commerce.form_collects_health_information", "Health information collection detected"],
      ["commerce.form_collects_financial_information", "Financial information collection detected"],
      ["commerce.form_collects_geolocation", "Geolocation collection detected"]
    ].map(([signalKey, title]) => ({
      name: `${signalKey} without retained field evidence is blocked`,
      concern: makeConcern({
        originKey: signalKey,
        suggestedUnifiedFindingId: undefined,
        title
      }),
      evidenceStrengthFlags: ["fallback_only"] as const,
      rawEvidence: {
        signalKey,
        signalValue: true
      },
      expected: {
        allowedNarrativeTier: "weak",
        promotionEligibility: "blocked",
        externalSurfacingEligibility: "suppress",
        negativeEvidenceFlags: ["missing_specific_runtime_anchor", "runtime_tracking_review_incomplete"]
      }
    })),
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
      name: "sensitive replay concern with retained co-occurrence evidence stays eligible",
      concern: makeConcern({
        originKey: "commerce.high_sensitivity_data_collection_detected",
        suggestedUnifiedFindingId: "session_replay_on_sensitive_input_surface",
        title: "Sensitive replay detected"
      }),
      evidenceStrengthFlags: ["concrete_payload", "fallback_only"] as const,
      rawEvidence: {
        sensitivePayloadViolations: [
          {
            evidenceSource: "sensitive_field_session_replay_correlation",
            evidenceStrength: "form_field_signal",
            requestUrl: "https://clarity.ms/collect",
            vendorHost: "clarity.ms"
          }
        ]
      },
      expected: {
        allowedNarrativeTier: "moderate",
        promotionEligibility: "eligible",
        externalSurfacingEligibility: "eligible",
        negativeEvidenceFlags: []
      }
    },
    {
      name: "sensitive replay concern with independent sensitive payload stays audit-only",
      concern: makeConcern({
        originKey: "commerce.high_sensitivity_data_collection_detected",
        suggestedUnifiedFindingId: "session_replay_on_sensitive_input_surface",
        title: "Sensitive replay detected"
      }),
      evidenceStrengthFlags: ["direct_runtime", "concrete_payload"] as const,
      rawEvidence: {
        sensitivePayloadViolations: [
          {
            evidenceStrength: "form_field_signal",
            matchSnippet: "Bank account",
            requestUrl: "",
            sourceField: "bank_account"
          }
        ],
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
            detectedType: "government_id",
            evidenceStrength: "suspected",
            matchSnippet: "Passport number",
            sourceField: "passport_number"
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
        negativeEvidenceFlags: ["missing_representative_accessibility_examples"]
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
        negativeEvidenceFlags: ["missing_representative_accessibility_examples"]
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
        negativeEvidenceFlags: ["accessibility_examples_below_promotion_threshold"]
      }
    },
    {
      name: "contrast failures with automated count evidence can promote",
      concern: makeConcern({
        originType: "validation_rule",
        originKey: "accessibility_review.contrast_failures",
        suggestedUnifiedFindingId: "contrast_failures",
        title: "Contrast failures"
      }),
      evidenceStrengthFlags: ["structured_validation"] as const,
      rawEvidence: {
        count: 2
      },
      expected: {
        allowedNarrativeTier: "moderate",
        promotionEligibility: "eligible",
        externalSurfacingEligibility: "eligible",
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

test("CPRA CBA opt-out concern policy requires CPRA-relevant context", () => {
  const concern = makeConcern({
    originKey: "privacy.cpra_cba_opt_out_missing",
    originType: "snapshot_signal",
    suggestedUnifiedFindingId: "cpra_cba_opt_out_missing",
    title: "CPRA CBA opt-out missing"
  });

  const adtechOnly = deriveConcernPolicy({
    concern,
    evidenceStrengthFlags: ["direct_runtime"],
    rawEvidence: {
      cbaVendorTier1: ["adsrvr.org"],
      optOutUiResult: "absent",
      policyCbaLanguage: "absent",
      suppressorApplied: null
    }
  });
  assert.equal(adtechOnly.promotionEligibility, "internal_only");
  assert.equal(adtechOnly.externalSurfacingEligibility, "audit_only");

  const policyContext = deriveConcernPolicy({
    concern,
    evidenceStrengthFlags: ["direct_runtime"],
    rawEvidence: {
      cbaVendorTier1: ["adsrvr.org"],
      optOutUiResult: "absent",
      policyCbaLanguage: "full_cba_language",
      suppressorApplied: null
    }
  });
  assert.equal(policyContext.promotionEligibility, "eligible");
  assert.equal(policyContext.externalSurfacingEligibility, "eligible");
});

test("pre-consent policy requires timeline sequence plus non-essential request classification", () => {
  const concern = makeConcern({
    originKey: "privacy.preconsent_tracking_detected",
    originType: "snapshot_signal",
    suggestedUnifiedFindingId: "preconsent_tracking",
    title: "Pre-consent tracking detected"
  });

  const strong = deriveConcernPolicy({
    concern,
    evidenceStrengthFlags: ["direct_runtime"],
    rawEvidence: {
      consentActionableChoiceObserved: true,
      consentSurfaceObserved: true,
      consentTimeline: {
        firstCmpVisibleMs: 1000,
        firstConsentActionMs: 1500,
        firstNonEssentialRequestMs: 250,
        timelineConfidence: "high"
      },
      requestPurposeClassificationConfidence: [
        {
          confidence: 0.9,
          essentiality: "non_essential",
          requestUrl: "https://analytics.example/pixel",
          vendor: "Example Analytics"
        }
      ],
      signalKey: "privacy.preconsent_tracking_detected"
    }
  });

  assert.equal(strong.promotionEligibility, "eligible");
  assert.equal(strong.allowedNarrativeTier, "strong");

  const ambiguous = deriveConcernPolicy({
    concern,
    evidenceStrengthFlags: ["direct_runtime"],
    rawEvidence: {
      consentActionableChoiceObserved: true,
      consentSurfaceObserved: true,
      consentTimeline: {
        firstCmpVisibleMs: null,
        firstConsentActionMs: null,
        firstNonEssentialRequestMs: 250,
        timelineConfidence: "low"
      },
      requestPurposeClassificationConfidence: [
        {
          confidence: 0.9,
          essentiality: "unknown",
          requestUrl: "https://cdn.example/app.js",
          vendor: null
        }
      ],
      signalKey: "privacy.preconsent_tracking_detected"
    }
  });

  assert.equal(ambiguous.promotionEligibility, "internal_only");
  assert.equal(ambiguous.externalSurfacingEligibility, "audit_only");
});

test("reject persistence policy requires a successful reject path and post-reject timing", () => {
  const concern = makeConcern({
    originKey: "consent_reject_reduced_tracking",
    originType: "snapshot_signal",
    suggestedUnifiedFindingId: "reject_did_not_reduce_tracking",
    title: "Reject path did not reduce tracking"
  });

  const eligible = deriveConcernPolicy({
    concern,
    evidenceStrengthFlags: ["direct_runtime"],
    rawEvidence: {
      postRejectNonEssentialRequests: [
        {
          category: "analytics",
          ms_after_reject: 3500,
          ts_ms: 5000,
          url: "https://analytics.example/pixel",
          vendor: "Example Analytics"
        }
      ],
      requestPurposeClassificationConfidence: [
        {
          confidence: 0.91,
          essentiality: "non_essential",
          requestUrl: "https://analytics.example/pixel"
        }
      ],
      rejectPathDepthAndAvailability: {
        rejectInteractionSucceeded: true
      },
      suppressionChecks: {
        post_reject_window_available: true
      }
    }
  });

  assert.equal(eligible.promotionEligibility, "eligible");

  const eligibleRequestUrl = deriveConcernPolicy({
    concern,
    evidenceStrengthFlags: ["direct_runtime"],
    rawEvidence: {
      postRejectNonEssentialRequests: [
        {
          category: "analytics",
          ms_after_reject: 3500,
          requestUrl: "https://analytics.example/pixel",
          ts_ms: 5000,
          vendor: "Example Analytics"
        }
      ],
      requestPurposeClassificationConfidence: [
        {
          confidence: 0.91,
          essentiality: "non_essential",
          requestUrl: "https://analytics.example/pixel"
        }
      ],
      rejectPathDepthAndAvailability: {
        rejectInteractionSucceeded: true
      },
      suppressionChecks: {
        post_reject_window_available: true
      }
    }
  });

  assert.equal(eligibleRequestUrl.promotionEligibility, "eligible");
  assert.equal(eligibleRequestUrl.negativeEvidenceFlags.includes("missing_post_reject_timing_evidence"), false);

  const failedReject = deriveConcernPolicy({
    concern,
    evidenceStrengthFlags: ["direct_runtime"],
    rawEvidence: {
      postRejectNonEssentialRequests: [
        {
          category: "analytics",
          ms_after_reject: 3500,
          ts_ms: 5000,
          url: "https://analytics.example/pixel",
          vendor: "Example Analytics"
        }
      ],
      rejectPathDepthAndAvailability: {
        rejectInteractionSucceeded: false
      },
      suppressionChecks: {
        post_reject_window_available: true
      }
    }
  });

  assert.equal(failedReject.promotionEligibility, "internal_only");
  assert.equal(failedReject.negativeEvidenceFlags.includes("missing_post_reject_timing_evidence"), true);
});

test("reject persistence policy keeps vendor-backed post-reject evidence without retained timing audit-only", () => {
  const concern = makeConcern({
    originKey: "consent_reject_reduced_tracking",
    originType: "snapshot_signal",
    suggestedUnifiedFindingId: "reject_did_not_reduce_tracking",
    title: "Reject path did not reduce tracking"
  });

  const noTiming = deriveConcernPolicy({
    concern,
    evidenceStrengthFlags: ["direct_runtime"],
    rawEvidence: {
      consentPostRejectTrackerEvidenceUrls: [
        "https://www.googletagmanager.com/gtm.js?id=GTM-TEST",
        "https://googleads.g.doubleclick.net/pagead/viewthroughconversion/1",
        "https://analytics.google.com/g/collect?v=2",
        "https://munchkin.marketo.net/munchkin.js",
        "https://www.facebook.com/tr/"
      ],
      persisted_tracker_vendors: ["Google Ads", "Google Analytics", "Google Tag Manager", "Marketo", "Meta Pixel"],
      rejectPathDepthAndAvailability: {
        rejectInteractionSucceeded: true
      },
      suppressionChecks: {
        baseline_contradiction_detected: false,
        cmp_initialization_only: false,
        navigation_or_reload_ambiguous: false,
        post_reject_window_available: false,
        reject_click_confirmed: true
      }
    }
  });

  assert.equal(noTiming.allowedNarrativeTier, "weak");
  assert.equal(noTiming.externalSurfacingEligibility, "audit_only");
  assert.equal(noTiming.promotionEligibility, "internal_only");
  assert.ok(noTiming.negativeEvidenceFlags.includes("missing_post_reject_timing_evidence"));

  const thin = deriveConcernPolicy({
    concern,
    evidenceStrengthFlags: ["direct_runtime"],
    rawEvidence: {
      consentPostRejectTrackerEvidenceUrls: [
        "https://analytics.google.com/g/collect?v=2",
        "https://www.googletagmanager.com/gtm.js?id=GTM-TEST"
      ],
      persisted_tracker_vendors: ["Google Analytics"],
      rejectPathDepthAndAvailability: {
        rejectInteractionSucceeded: true
      },
      suppressionChecks: {
        post_reject_window_available: false,
        reject_click_confirmed: true
      }
    }
  });

  assert.equal(thin.externalSurfacingEligibility, "audit_only");
  assert.equal(thin.promotionEligibility, "internal_only");
});

test("reject persistence policy keeps cookie diff provenance audit-only without post-reject request timing", () => {
  const concern = makeConcern({
    originKey: "consent_reject_reduced_tracking",
    originType: "snapshot_signal",
    suggestedUnifiedFindingId: "reject_did_not_reduce_tracking",
    title: "Reject path did not reduce tracking"
  });

  const promoted = deriveConcernPolicy({
    concern,
    evidenceStrengthFlags: ["direct_runtime"],
    rawEvidence: {
      consentPostRejectTrackerEvidenceUrls: [
        "https://track.hubspot.com/__ptq.gif",
        "https://forms-na1.hsforms.com/embed/v3/counters.gif",
        "https://www.googleadservices.com/pagead/conversion.js"
      ],
      persisted_tracker_vendors: ["HubSpot", "Google Ads"],
      rejectCookieDiffProvenance: {
        summary: {
          thirdPartyAddedAfterRejectCount: 4
        }
      },
      rejectInteractionAttribution: {
        clickedLabel: "Reject All",
        finalUrlHostChanged: false
      },
      rejectPathDepthAndAvailability: {
        rejectInteractionSucceeded: true
      },
      suppressionChecks: {
        baseline_contradiction_detected: false,
        cmp_initialization_only: false,
        navigation_or_reload_ambiguous: false,
        post_reject_window_available: false,
        reject_click_confirmed: true
      }
    }
  });

  assert.equal(promoted.allowedNarrativeTier, "weak");
  assert.equal(promoted.externalSurfacingEligibility, "audit_only");
  assert.equal(promoted.promotionEligibility, "internal_only");
  assert.ok(promoted.negativeEvidenceFlags.includes("missing_post_reject_timing_evidence"));

  const nonRejectLabel = deriveConcernPolicy({
    concern,
    evidenceStrengthFlags: ["direct_runtime"],
    rawEvidence: {
      consentPostRejectTrackerEvidenceUrls: [
        "https://analytics.google.com/g/collect?v=2",
        "https://www.googletagmanager.com/gtm.js?id=GTM-TEST",
        "https://www.googleadservices.com/pagead/conversion.js",
        "https://googleads.g.doubleclick.net/pagead/viewthroughconversion/1",
        "https://track.hubspot.com/__ptq.gif"
      ],
      persisted_tracker_vendors: ["Google Analytics", "Google Ads"],
      rejectCookieDiffProvenance: {
        summary: {
          thirdPartyAddedAfterRejectCount: 6
        }
      },
      rejectInteractionAttribution: {
        clickedLabel: "Stream and save",
        finalUrlHostChanged: false
      },
      rejectPathDepthAndAvailability: {
        rejectInteractionSucceeded: true
      },
      suppressionChecks: {
        post_reject_window_available: false,
        reject_click_confirmed: true
      }
    }
  });

  assert.equal(nonRejectLabel.externalSurfacingEligibility, "audit_only");
  assert.equal(nonRejectLabel.promotionEligibility, "internal_only");
});

test("bot-block evidence keeps uncorroborated surface claims audit-only", () => {
  const decision = deriveConcernPolicy({
    concern: makeConcern({
      originKey: "privacy_policy_present",
      originType: "snapshot_signal",
      suggestedUnifiedFindingId: "privacy_policy_present",
      title: "Privacy policy present"
    }),
    evidenceStrengthFlags: ["direct_runtime"],
    rawEvidence: {
      botBlockChallengeEvidence: {
        blocked: true,
        challengeType: "captcha_probable",
        confidence: 0.9,
        coverageImpact: "severe",
        httpStatus: 403,
        markerMatches: ["captcha_marker", "http:403"],
        vendor: "cloudflare"
      }
    }
  });

  assert.equal(decision.promotionEligibility, "internal_only");
  assert.equal(decision.negativeEvidenceFlags.includes("blocked_or_interstitial_evidence_observed"), true);
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

test("deriveConcernPolicy keeps vendor-only pre-consent evidence audit-only", () => {
  const policy = deriveConcernPolicy({
    concern: makeConcern({
      originKey: "privacy.preconsent_tracking_detected",
      suggestedUnifiedFindingId: "preconsent_tracking",
      title: "Pre-consent tracking detected"
    }),
    evidenceStrengthFlags: ["direct_runtime"],
    rawEvidence: {
      preconsent_tracker_vendors: ["Meta Pixel"],
      preconsent_tracking_detected: true,
      supportingSignals: ["privacy.preconsent_tracking_detected"]
    }
  });

  assert.equal(policy.allowedNarrativeTier, "weak");
  assert.equal(policy.promotionEligibility, "internal_only");
  assert.equal(policy.externalSurfacingEligibility, "audit_only");
});

test("deriveConcernPolicy keeps snapshot boolean-only pre-consent evidence audit-only", () => {
  const policy = deriveConcernPolicy({
    concern: makeConcern({
      originKey: "privacy.pre_consent_tracking_detected",
      suggestedUnifiedFindingId: "preconsent_tracking",
      title: "Pre-consent tracking detected"
    }),
    evidenceStrengthFlags: ["direct_runtime"],
    rawEvidence: {
      consentActionableChoiceObserved: true,
      consentSurfaceObserved: true,
      preconsent_tracking_detected: true,
      tracking_before_consent_detected: true,
      thirdPartyCookieSetBeforeConsent: true,
      supportingSignals: ["privacy.preconsent_tracking_detected"]
    }
  });

  assert.equal(policy.allowedNarrativeTier, "weak");
  assert.equal(policy.promotionEligibility, "internal_only");
  assert.equal(policy.externalSurfacingEligibility, "audit_only");
  assert.ok(policy.negativeEvidenceFlags.includes("missing_preconsent_sequence_evidence"));
});

test("deriveConcernPolicy applies consentTimeline gate to validation-rule pre-consent findings", () => {
  const policy = deriveConcernPolicy({
    concern: makeConcern({
      originKey: "runtime_privacy.preconsent_tracking_observed",
      originType: "validation_rule",
      suggestedUnifiedFindingId: "preconsent_tracking",
      title: "Tracking observed before consent"
    }),
    evidenceStrengthFlags: ["direct_runtime", "structured_validation"],
    rawEvidence: {
      consentActionableChoiceObserved: true,
      consentSurfaceObserved: true,
      preconsent_tracker_evidence_urls: ["https://www.googletagmanager.com/gtm.js"],
      preconsent_tracker_vendors: ["Google Tag Manager"],
      preconsent_tracking_detected: true
    }
  });

  assert.equal(policy.allowedNarrativeTier, "weak");
  assert.equal(policy.promotionEligibility, "internal_only");
  assert.equal(policy.externalSurfacingEligibility, "audit_only");
  assert.ok(policy.negativeEvidenceFlags.includes("missing_preconsent_sequence_evidence"));
});

test("deriveConcernPolicy keeps pre-consent evidence without consentTimeline audit-only", () => {
  const policy = deriveConcernPolicy({
    concern: makeConcern({
      originKey: "privacy.preconsent_tracking_detected",
      suggestedUnifiedFindingId: "preconsent_tracking",
      title: "Pre-consent tracking detected"
    }),
    evidenceStrengthFlags: ["direct_runtime"],
    rawEvidence: {
      preconsent_tracker_evidence_urls: ["https://connect.facebook.net/fbevents.js"],
      preconsent_tracker_vendors: ["Meta Pixel"],
      preconsent_tracking_detected: true,
      supportingSignals: ["privacy.preconsent_tracking_detected"]
    }
  });

  assert.equal(policy.allowedNarrativeTier, "weak");
  assert.equal(policy.promotionEligibility, "internal_only");
  assert.equal(policy.externalSurfacingEligibility, "audit_only");
  assert.ok(policy.negativeEvidenceFlags.includes("missing_preconsent_sequence_evidence"));
});

test("deriveConcernPolicy promotes pre-consent evidence with consentTimeline sequence", () => {
  const policy = deriveConcernPolicy({
    concern: makeConcern({
      originKey: "privacy.preconsent_tracking_detected",
      suggestedUnifiedFindingId: "preconsent_tracking",
      title: "Pre-consent tracking detected"
    }),
    evidenceStrengthFlags: ["direct_runtime"],
    rawEvidence: {
      consentActionableChoiceObserved: true,
      consentSurfaceObserved: true,
      consentTimeline: {
        firstCmpVisibleMs: 1000,
        firstConsentActionMs: 1500,
        firstNonEssentialRequestMs: 250,
        timelineConfidence: "high"
      },
      preconsent_tracker_evidence_urls: ["https://connect.facebook.net/fbevents.js"],
      preconsent_tracker_vendors: ["Meta Pixel"],
      requestPurposeClassificationConfidence: [
        {
          confidence: 0.9,
          essentiality: "non_essential",
          requestUrl: "https://connect.facebook.net/fbevents.js",
          vendor: "Meta Pixel"
        }
      ],
      preconsent_tracking_detected: true
    }
  });

  assert.equal(policy.allowedNarrativeTier, "strong");
  assert.equal(policy.promotionEligibility, "eligible");
  assert.equal(policy.externalSurfacingEligibility, "eligible");
});

test("deriveConcernPolicy promotes pre-submit capture only for retained no-submit third-party tracking evidence", () => {
  const signalOnly = deriveConcernPolicy({
    concern: {
      canonicalConcernKey: "pre_submit_text_capture_detected",
      originKey: "privacy.pre_submit_text_capture_detected",
      originType: "compatibility_signal",
      policyIsPrimarySource: null,
      policyPageType: null,
      suggestedUnifiedFindingId: "pre_submit_text_capture_detected",
      title: "Pre-submit text capture detected"
    },
    evidenceStrengthFlags: ["direct_runtime", "page_attributed"],
    rawEvidence: {
      signalKey: "privacy.pre_submit_text_capture_detected",
      signalValue: ["sha256 sentinel in third_party_tracking_hashed_identifier request to analytics.twitter.com"]
    }
  });
  assert.equal(signalOnly.promotionEligibility, "internal_only");

  const promoted = deriveConcernPolicy({
    concern: {
      canonicalConcernKey: "pre_submit_text_capture_detected",
      originKey: "privacy.pre_submit_text_capture_detected",
      originType: "compatibility_signal",
      policyIsPrimarySource: null,
      policyPageType: null,
      suggestedUnifiedFindingId: "pre_submit_text_capture_detected",
      title: "Pre-submit text capture detected"
    },
    evidenceStrengthFlags: ["direct_runtime", "page_attributed"],
    rawEvidence: {
      preSubmitTextCaptureEvidence: [
        {
          destinationClassification: "third_party_tracking_hashed_identifier",
          matchType: "sha256",
          requestDomain: "analytics.twitter.com",
          requestUrl: "https://analytics.twitter.com/i/adsct",
          submitObserved: false
        }
      ]
    }
  });
  assert.equal(promoted.promotionEligibility, "eligible");

  const retainedOnly = deriveConcernPolicy({
    concern: {
      canonicalConcernKey: "pre_submit_text_capture_detected",
      originKey: "privacy.pre_submit_text_capture_detected",
      originType: "compatibility_signal",
      policyIsPrimarySource: null,
      policyPageType: null,
      suggestedUnifiedFindingId: "pre_submit_text_capture_detected",
      title: "Pre-submit text capture detected"
    },
    evidenceStrengthFlags: ["direct_runtime", "page_attributed"],
    rawEvidence: {
      preSubmitTextCaptureEvidence: [
        {
          submitObserved: false,
          destinationClassification: "first_party_autocomplete",
          requestDomain: "typeahead.example.com"
        }
      ]
    }
  });
  assert.equal(retainedOnly.promotionEligibility, "internal_only");
});

test("deriveConcernPolicy keeps non-essential pre-consent cookie evidence without consentTimeline audit-only", () => {
  const policy = deriveConcernPolicy({
    concern: makeConcern({
      originKey: "privacy.preconsent_tracking_detected",
      suggestedUnifiedFindingId: "preconsent_tracking",
      title: "Pre-consent tracking detected"
    }),
    evidenceStrengthFlags: ["direct_runtime"],
    rawEvidence: {
      preconsent_cookie_evidence: [
        {
          category: "advertising",
          cookieName: "_fbp",
          nonEssential: true,
          party: "third_party",
          timingEvidence: "before_consent_cookie_write"
        }
      ],
      preconsent_cookie_names: ["_fbp"],
      preconsent_nonessential_cookie_names: ["_fbp"],
      preconsent_tracking_detected: true,
      supportingSignals: ["privacy.preconsent_tracking_detected"]
    }
  });

  assert.equal(policy.allowedNarrativeTier, "weak");
  assert.equal(policy.promotionEligibility, "internal_only");
  assert.equal(policy.externalSurfacingEligibility, "audit_only");
  assert.ok(policy.negativeEvidenceFlags.includes("missing_preconsent_sequence_evidence"));
});

test("deriveConcernPolicy promotes classified pre-consent cookie writes with consentTimeline sequence", () => {
  const policy = deriveConcernPolicy({
    concern: makeConcern({
      originKey: "privacy.preconsent_tracking_detected",
      suggestedUnifiedFindingId: "preconsent_tracking",
      title: "Pre-consent tracking detected"
    }),
    evidenceStrengthFlags: ["direct_runtime"],
    rawEvidence: {
      consentActionableChoiceObserved: true,
      consentSurfaceObserved: true,
      consentTimeline: {
        firstCmpVisibleMs: 1000,
        firstConsentActionMs: 1500,
        firstTrackingCookieSetMs: 250,
        timelineConfidence: "high"
      },
      preconsent_cookie_evidence: [
        {
          category: "advertising",
          cookieName: "_fbp",
          nonEssential: true,
          party: "third_party",
          timingEvidence: "before_consent_cookie_write"
        }
      ],
      preconsent_cookie_names: ["_fbp"],
      preconsent_nonessential_cookie_names: ["_fbp"],
      preconsent_tracking_detected: true,
      supportingSignals: ["privacy.preconsent_tracking_detected"]
    }
  });

  assert.equal(policy.allowedNarrativeTier, "strong");
  assert.equal(policy.promotionEligibility, "eligible");
  assert.equal(policy.externalSurfacingEligibility, "eligible");
  assert.ok(!policy.negativeEvidenceFlags.includes("missing_preconsent_sequence_evidence"));
});

test("deriveConcernPolicy keeps necessary pre-consent cookie evidence audit-only", () => {
  const policy = deriveConcernPolicy({
    concern: makeConcern({
      originKey: "privacy.preconsent_tracking_detected",
      suggestedUnifiedFindingId: "preconsent_tracking",
      title: "Pre-consent tracking detected"
    }),
    evidenceStrengthFlags: ["direct_runtime"],
    rawEvidence: {
      preconsent_cookie_evidence: [
        {
          category: "necessary",
          cookieName: "__cf_bm",
          nonEssential: false,
          timingEvidence: "before_consent_cookie_write"
        }
      ],
      preconsent_cookie_names: ["__cf_bm"],
      preconsent_tracking_detected: true,
      supportingSignals: ["privacy.preconsent_tracking_detected"]
    }
  });

  assert.equal(policy.allowedNarrativeTier, "weak");
  assert.equal(policy.promotionEligibility, "internal_only");
  assert.equal(policy.externalSurfacingEligibility, "audit_only");
  assert.ok(policy.negativeEvidenceFlags.includes("missing_concrete_preconsent_artifact"));
});

test("deriveConcernPolicy keeps thin fingerprinting evidence audit-only", () => {
  const policy = deriveConcernPolicy({
    concern: makeConcern({
      originKey: "privacy.fingerprinting_detected",
      suggestedUnifiedFindingId: "fingerprinting_observed",
      title: "Fingerprinting observed"
    }),
    evidenceStrengthFlags: ["direct_runtime"],
    rawEvidence: {
      fingerprintSummary: {
        tier: 2
      }
    }
  });

  assert.equal(policy.allowedNarrativeTier, "weak");
  assert.equal(policy.promotionEligibility, "internal_only");
  assert.equal(policy.externalSurfacingEligibility, "audit_only");
});

test("deriveConcernPolicy promotes corroborated fingerprinting evidence", () => {
  const policy = deriveConcernPolicy({
    concern: makeConcern({
      originKey: "privacy.fingerprinting_detected",
      suggestedUnifiedFindingId: "fingerprinting_observed",
      title: "Fingerprinting observed"
    }),
    evidenceStrengthFlags: ["direct_runtime"],
    rawEvidence: {
      fingerprintAttributeCategories: ["canvas_webgl"],
      fingerprintSummary: {
        tier: 2
      },
      requestUrls: ["https://fp.example.test/collect"]
    }
  });

  assert.equal(policy.promotionEligibility, "eligible");
  assert.equal(policy.externalSurfacingEligibility, "eligible");
});

test("deriveConcernPolicy promotes same-page video content tracking exposure", () => {
  const policy = deriveConcernPolicy({
    concern: makeConcern({
      originKey: "privacy.video_content_tracking_exposure_detected",
      suggestedUnifiedFindingId: "video_content_tracking_exposure",
      title: "Video content tracking exposure detected"
    }),
    evidenceStrengthFlags: ["direct_runtime", "page_attributed"],
    rawEvidence: {
      metaPixelPayloadFieldHints: ["ev", "dl", "page_title"],
      metaPixelRequestUrls: ["https://www.facebook.com/tr/?ev=PageView"],
      runtimeVendors: ["Meta Pixel"],
      samePageVideoTrackingCorrelation: true,
      videoContentSurfaceObserved: true,
      videoPageUrls: ["https://example.com/watch/highlights"],
      videoTitleSnippets: ["Week 1 highlights"]
    }
  });

  assert.equal(policy.allowedNarrativeTier, "strong");
  assert.equal(policy.promotionEligibility, "eligible");
  assert.equal(policy.externalSurfacingEligibility, "eligible");
});

test("deriveConcernPolicy promotes RTB cookie sync only with concrete request-level support", () => {
  const policy = deriveConcernPolicy({
    concern: makeConcern({
      originKey: "runtime_privacy.rtb_cookie_sync_observed",
      originType: "validation_rule",
      suggestedUnifiedFindingId: "rtb_cookie_sync_observed",
      title: "RTB cookie sync observed"
    }),
    evidenceStrengthFlags: ["direct_runtime", "structured_validation"],
    rawEvidence: {
      preconsent_tracking_detected: true,
      rtb_cookie_sync_evidence: [
        {
          hostname: "sync-t1.taboola.com",
          pathSample: "/sg/pubmatic-network/1/rtb-h/",
          queryKeysSample: ["gdpr", "uid"],
          reason: "sync_path",
          runtimePhase: "pre_consent",
          urlSample: "https://sync-t1.taboola.com/sg/pubmatic-network/1/rtb-h/"
        }
      ],
      rtb_cookie_sync_vendors: ["PubMatic"]
    }
  });

  assert.equal(policy.allowedNarrativeTier, "moderate");
  assert.equal(policy.promotionEligibility, "eligible");
  assert.equal(policy.externalSurfacingEligibility, "eligible");
});

test("deriveConcernPolicy promotes cross-domain identifier sharing only with concrete multi-destination runtime support", () => {
  const policy = deriveConcernPolicy({
    concern: makeConcern({
      originKey: "privacy.cross_domain_identifier_sharing_observed",
      suggestedUnifiedFindingId: "cross_domain_identifier_sharing_observed",
      title: "Identifiers shared across domains"
    }),
    evidenceStrengthFlags: ["direct_runtime"],
    rawEvidence: {
      crossDomainIdentifierSharingDestinationCategories: ["rtb", "identity_graph"],
      crossDomainIdentifierSharingDestinationEtlds: ["adnxs.com", "rlcdn.com"],
      crossDomainIdentifierSharingEvidence: [
        {
          destinationClassification: "rtb",
          destinationDomain: "sync.adnxs.com",
          destinationEtldPlusOne: "adnxs.com",
          identifierClass: "durable_id",
          key: "uid",
          repeatedAcrossEtlds: ["adnxs.com", "rlcdn.com"],
          requestUrlRedacted: "https://sync.adnxs.com/getuid?uid=%5Bredacted%5D",
          valueHash: "a".repeat(64)
        }
      ]
    }
  });

  assert.equal(policy.allowedNarrativeTier, "strong");
  assert.equal(policy.promotionEligibility, "eligible");
  assert.equal(policy.externalSurfacingEligibility, "eligible");
});

test("deriveConcernPolicy promotes cross-domain identifier sharing when redirect-chain urls retain multiple adtech domains", () => {
  const policy = deriveConcernPolicy({
    concern: makeConcern({
      originKey: "privacy.cross_domain_identifier_sharing_observed",
      suggestedUnifiedFindingId: "cross_domain_identifier_sharing_observed",
      title: "Identifiers shared across domains"
    }),
    evidenceStrengthFlags: ["direct_runtime"],
    rawEvidence: {
      crossDomainIdentifierSharingDestinationCategories: ["other"],
      crossDomainIdentifierSharingDestinationEtlds: ["yahoo.com", "casalemedia.com", "ay.delivery"],
      crossDomainIdentifierSharingEvidence: [
        {
          destinationClassification: "other",
          destinationDomain: "ups.analytics.yahoo.com",
          destinationEtldPlusOne: "yahoo.com",
          identifierClass: "durable_id",
          key: "uid",
          repeatedAcrossEtlds: ["yahoo.com"],
          requestUrlRedacted: "https://ups.analytics.yahoo.com/ups/58922/cms?uid=%5Bredacted%5D",
          sourcePageUrl:
            "https://ssum.casalemedia.com/usermatch?cb=https%3A%2F%2Fpbs-us-east.ay.delivery%2Fsetuid%3Fuid%3D",
          valueHash: "c".repeat(64)
        }
      ]
    }
  });

  assert.equal(policy.allowedNarrativeTier, "strong");
  assert.equal(policy.promotionEligibility, "eligible");
  assert.equal(policy.externalSurfacingEligibility, "eligible");
});

test("deriveConcernPolicy keeps weak cross-domain identifier evidence audit-only", () => {
  const policy = deriveConcernPolicy({
    concern: makeConcern({
      originKey: "privacy.cross_domain_identifier_sharing_observed",
      suggestedUnifiedFindingId: "cross_domain_identifier_sharing_observed",
      title: "Identifiers shared across domains"
    }),
    evidenceStrengthFlags: ["direct_runtime"],
    rawEvidence: {
      crossDomainIdentifierSharingDestinationCategories: ["other"],
      crossDomainIdentifierSharingDestinationEtlds: ["example-cdn.com"],
      crossDomainIdentifierSharingEvidence: [
        {
          destinationClassification: "other",
          destinationEtldPlusOne: "example-cdn.com",
          identifierClass: "unknown_identifier",
          key: "uid",
          repeatedAcrossEtlds: ["example-cdn.com"],
          requestUrlRedacted: "https://cdn.example-cdn.com/pixel?uid=%5Bredacted%5D",
          valueHash: "b".repeat(64)
        }
      ]
    }
  });

  assert.equal(policy.allowedNarrativeTier, "weak");
  assert.equal(policy.promotionEligibility, "internal_only");
  assert.equal(policy.externalSurfacingEligibility, "audit_only");
  assert.ok(policy.negativeEvidenceFlags.includes("missing_specific_runtime_anchor"));
});

test("deriveConcernPolicy suppresses cookie disclosure gaps backed only by ignored runtime cookies", () => {
  const policy = deriveConcernPolicy({
    concern: makeConcern({
      originKey: "cookie_runtime.disclosure_gap",
      originType: "validation_rule",
      suggestedUnifiedFindingId: "cookie_disclosure_gap",
      title: "Cookie disclosure gap"
    }),
    evidenceStrengthFlags: ["direct_runtime", "structured_validation"],
    rawEvidence: {
      ignored_runtime_cookie_names: ["awsalb", "awsalbcors"],
      runtime_cookie_names: ["__cf_bm", "optanonconsent", "geo_country", "trp-country", "trp-language"],
      unmatched_third_party_cookie_count: 0
    }
  });

  assert.equal(policy.allowedNarrativeTier, "weak");
  assert.equal(policy.promotionEligibility, "blocked");
  assert.equal(policy.externalSurfacingEligibility, "suppress");
  assert.ok(policy.negativeEvidenceFlags.includes("runtime_cookie_inventory_ignored_only"));
});

test("deriveConcernPolicy keeps cookie disclosure gaps eligible for substantive unmatched cookies", () => {
  const policy = deriveConcernPolicy({
    concern: makeConcern({
      originKey: "cookie_runtime.disclosure_gap",
      originType: "validation_rule",
      suggestedUnifiedFindingId: "cookie_disclosure_gap",
      title: "Cookie disclosure gap"
    }),
    evidenceStrengthFlags: ["direct_runtime", "structured_validation"],
    rawEvidence: {
      ignored_runtime_cookie_names: ["awsalbcors"],
      disclosureMismatchExplained: true,
      disclosureSearchScopeRetained: true,
      mismatchExplanation: "Observed runtime cookie _fbp was not found in the retained cookie disclosure.",
      negativeDisclosureSearchPerformed: true,
      observedBehavior: "Runtime set _fbp.",
      policyExtractionStatus: "fetched",
      policySourceUrl: "https://example.com/cookie-policy",
      policySnippet: "Cookie policy text.",
      runtime_cookie_names: ["optanonconsent", "_fbp"],
      unmatched_cookie_names: ["_fbp"],
      unmatched_third_party_cookie_count: 1
    }
  });

  assert.equal(policy.allowedNarrativeTier, "strong");
  assert.equal(policy.promotionEligibility, "eligible");
  assert.equal(policy.externalSurfacingEligibility, "eligible");
});

test("deriveConcernPolicy keeps RTB cookie sync audit-only for vendor names or generic adtech without sync evidence", () => {
  for (const rawEvidence of [
    {
      preconsent_tracking_detected: true,
      rtb_cookie_sync_vendors: ["PubMatic", "OpenX"]
    },
    {
      preconsent_tracking_detected: true,
      runtimeRequestUrls: ["https://cdn.generic-adtech.example/library.js"],
      runtimeVendors: ["Generic Adtech"]
    }
  ]) {
    const policy = deriveConcernPolicy({
      concern: makeConcern({
        originKey: "runtime_privacy.rtb_cookie_sync_observed",
        originType: "validation_rule",
        suggestedUnifiedFindingId: "rtb_cookie_sync_observed",
        title: "RTB cookie sync observed"
      }),
      evidenceStrengthFlags: ["structured_validation"],
      rawEvidence
    });

    assert.equal(policy.allowedNarrativeTier, "weak");
    assert.equal(policy.promotionEligibility, "internal_only");
    assert.equal(policy.externalSurfacingEligibility, "audit_only");
    assert.ok(policy.negativeEvidenceFlags.includes("missing_specific_runtime_anchor"));
  }
});

test("deriveConcernPolicy keeps uncorrelated video and Meta evidence audit-only", () => {
  const policy = deriveConcernPolicy({
    concern: makeConcern({
      originKey: "privacy.video_content_tracking_exposure_detected",
      suggestedUnifiedFindingId: "video_content_tracking_exposure",
      title: "Video content tracking exposure detected"
    }),
    evidenceStrengthFlags: ["direct_runtime", "page_attributed"],
    rawEvidence: {
      metaPixelRequestUrls: ["https://www.facebook.com/tr/?ev=PageView"],
      runtimeVendors: ["Meta Pixel"],
      samePageVideoTrackingCorrelation: false,
      videoContentSurfaceObserved: true,
      videoPageUrls: ["https://example.com/watch/highlights"]
    }
  });

  assert.equal(policy.allowedNarrativeTier, "weak");
  assert.equal(policy.promotionEligibility, "internal_only");
  assert.equal(policy.externalSurfacingEligibility, "audit_only");
  assert.ok(policy.negativeEvidenceFlags.includes("missing_specific_runtime_anchor"));
});
