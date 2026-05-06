import { PRIVACY_RUNTIME_FINDINGS_REVIEWED_EXAMPLES } from "./privacy-runtime-findings.reviewed";

export const PRIVACY_RUNTIME_FINDING_IDS = [
  "preconsent_tracking",
  "reject_did_not_reduce_tracking",
  "fingerprinting_observed",
  "reject_button_missing",
  "accept_more_prominent_than_reject",
  "forced_consent_wall",
  "accept_only_banner",
  "dismiss_without_reject",
  "consent_gated_tracking_claim_conflict",
  "cookie_disclosure_gap",
  "tracking_technologies_disclosure_present",
  "targeted_advertising_disclosure_present",
  "weak_cookie_security_attributes",
  "accessibility_support_path_missing",
  "privacy_rights_path_present",
  "privacy_contact_path_present",
  "privacy_policy_present",
  "sale_sharing_controls_missing",
  "pricing_or_fee_transparency_unclear",
  "terms_of_service_present",
  "privacy_contact_channel_missing",
  "third_party_advertising_disclosure_present",
  "unqualified_superlative_claim_detected",
  "children_privacy_disclosure_present",
  "do_not_sell_sharing_disclosure_conflict",
  "session_replay_observed",
  "simulated_performance_without_disclosure",
  "policy_clarity_risk",
  "gpc_disclosure_present",
  "arbitration_clause_present",
  "behavioral_analytics_disclosure_present",
  "cookie_policy_present",
  "missing_transfer_disclosure",
  "missing_dsar_mechanism"
] as const;

export const PRIVACY_RUNTIME_FINDING_GROUPS = [
  "preconsent_tracking",
  "fingerprinting",
  "dark_pattern_consent",
  "disclosure_runtime_mismatch",
  "production_surfaced_calibration"
] as const;

export const PRIVACY_RUNTIME_TOP_PRODUCTION_FINDING_IDS = [
  "consent_gated_tracking_claim_conflict",
  "preconsent_tracking",
  "reject_did_not_reduce_tracking",
  "weak_cookie_security_attributes",
  "accessibility_support_path_missing",
  "privacy_rights_path_present",
  "privacy_contact_path_present",
  "privacy_policy_present",
  "sale_sharing_controls_missing",
  "pricing_or_fee_transparency_unclear",
  "tracking_technologies_disclosure_present",
  "terms_of_service_present",
  "privacy_contact_channel_missing",
  "targeted_advertising_disclosure_present",
  "third_party_advertising_disclosure_present",
  "unqualified_superlative_claim_detected",
  "children_privacy_disclosure_present",
  "do_not_sell_sharing_disclosure_conflict",
  "session_replay_observed",
  "simulated_performance_without_disclosure",
  "policy_clarity_risk",
  "gpc_disclosure_present",
  "cookie_disclosure_gap",
  "arbitration_clause_present",
  "behavioral_analytics_disclosure_present",
  "cookie_policy_present",
  "missing_transfer_disclosure",
  "missing_dsar_mechanism"
] as const satisfies readonly PrivacyRuntimeFindingId[];

export const PRIVACY_RUNTIME_SCENARIO_TYPES = [
  "positive_high_confidence",
  "positive_moderate",
  "negative_control",
  "borderline_review",
  "borderline_audit_only"
] as const;

export const PRIVACY_RUNTIME_SOURCE_KINDS = [
  "live_artifact",
  "synthetic_fixture",
  "regression_case",
  "nano_review"
] as const;

export type PrivacyRuntimeFindingId = (typeof PRIVACY_RUNTIME_FINDING_IDS)[number];
export type PrivacyRuntimeFindingGroup = (typeof PRIVACY_RUNTIME_FINDING_GROUPS)[number];
export type PrivacyRuntimeScenarioType = (typeof PRIVACY_RUNTIME_SCENARIO_TYPES)[number];
export type PrivacyRuntimeSourceKind = (typeof PRIVACY_RUNTIME_SOURCE_KINDS)[number];

export type PrivacyRuntimePromotionEligibility = "eligible" | "internal_only" | "blocked";
export type PrivacyRuntimeExternalSurfacingEligibility = "eligible" | "audit_only" | "suppress";
export type PrivacyRuntimePresentationState = "confirmed" | "review" | "support_only" | "suppressed";
export type PrivacyRuntimeConfidenceBand = "high" | "moderate" | "low";

export type PrivacyRuntimeEvidence = {
  artifactRefs?: string[];
  attributeCategories?: string[];
  consentActionableChoiceObserved?: boolean;
  consentBannerDetectedMs?: number;
  consentSurfaceObserved?: boolean;
  detectionSource?: string;
  fingerprintConfidence?: "high" | "medium" | "low";
  fingerprintTier?: number;
  nanoPolicyAnchor?: {
    confidence: number;
    pageUrl: string;
    snippet: string;
    topic: string;
  };
  policyAnchor?: {
    claimType: string;
    confidence: number;
    extractionStatus: "fetched" | "parser_incomplete" | "missing";
    sourceUrl: string;
    snippet: string;
  };
  requestUrls?: string[];
  runtimeAnchor?: {
    confidence: number;
    observationType: string;
    phase: "pre_consent" | "post_reject" | "post_accept" | "unknown";
    requestUrls?: string[];
    vendors?: string[];
  };
  scriptHosts?: string[];
  sequenceEvidence?: boolean;
  signalKey?: string;
  snapshotEvidence?: Record<string, boolean | number | string | string[] | null>;
  uiFacts?: string[];
  urlAssessment?: {
    assessment: "supports_promotion" | "supports_demotion" | "borderline";
    rationale: string;
    reviewedAt: string;
    reviewedUrl: string;
  };
  vendorCategories?: string[];
  vendors?: string[];
  visualFacts?: string[];
};

export type PrivacyRuntimeFindingExpectation = {
  confidenceBand: PrivacyRuntimeConfidenceBand;
  externalSurfacingEligibility: PrivacyRuntimeExternalSurfacingEligibility;
  presentationState: PrivacyRuntimePresentationState;
  promotionEligibility: PrivacyRuntimePromotionEligibility;
};

export type PrivacyRuntimeFindingDatasetExample = {
  downgradeReason?: string;
  evidence: PrivacyRuntimeEvidence;
  expected: PrivacyRuntimeFindingExpectation;
  findingGroup: PrivacyRuntimeFindingGroup;
  findingId: PrivacyRuntimeFindingId;
  id: string;
  negativeControlReason?: string;
  notes: string;
  scenarioType: PrivacyRuntimeScenarioType;
  sourceKind: PrivacyRuntimeSourceKind;
};

export type PrivacyRuntimeFindingDatasetSummary = {
  borderlineCount: number;
  currentExampleCount: number;
  expectedConfidenceCounts: Record<PrivacyRuntimeConfidenceBand, number>;
  expectedPresentationCounts: Record<PrivacyRuntimePresentationState, number>;
  findingCounts: Record<PrivacyRuntimeFindingId, number>;
  groupCounts: Record<PrivacyRuntimeFindingGroup, number>;
  negativeCount: number;
  positiveCount: number;
  scenarioCounts: Record<PrivacyRuntimeScenarioType, number>;
  sourceKindCounts: Record<PrivacyRuntimeSourceKind, number>;
};

function positiveExpectation(confidenceBand: PrivacyRuntimeConfidenceBand = "high"): PrivacyRuntimeFindingExpectation {
  return {
    confidenceBand,
    externalSurfacingEligibility: "eligible",
    presentationState: confidenceBand === "high" ? "confirmed" : "review",
    promotionEligibility: "eligible"
  };
}

function negativeExpectation(): PrivacyRuntimeFindingExpectation {
  return {
    confidenceBand: "low",
    externalSurfacingEligibility: "suppress",
    presentationState: "suppressed",
    promotionEligibility: "blocked"
  };
}

function borderlineExpectation(
  presentationState: PrivacyRuntimePresentationState = "review"
): PrivacyRuntimeFindingExpectation {
  return {
    confidenceBand: "moderate",
    externalSurfacingEligibility: "audit_only",
    presentationState,
    promotionEligibility: "internal_only"
  };
}

function makeExamples(input: {
  count: number;
  evidenceFor: (index: number) => PrivacyRuntimeEvidence;
  expectationFor: (index: number) => PrivacyRuntimeFindingExpectation;
  findingGroup: PrivacyRuntimeFindingGroup;
  findingIds: PrivacyRuntimeFindingId[];
  idPrefix: string;
  notesFor: (index: number) => string;
  reasonFor?: (index: number) => { downgradeReason?: string; negativeControlReason?: string };
  scenarioType: PrivacyRuntimeScenarioType;
  sourceKindFor?: (index: number) => PrivacyRuntimeSourceKind;
}) {
  return Array.from({ length: input.count }, (_, index) => {
    const findingId = input.findingIds[index % input.findingIds.length]!;
    return {
      evidence: input.evidenceFor(index),
      expected: input.expectationFor(index),
      findingGroup: input.findingGroup,
      findingId,
      id: `${input.idPrefix}-${String(index + 1).padStart(2, "0")}`,
      notes: input.notesFor(index),
      scenarioType: input.scenarioType,
      sourceKind: input.sourceKindFor?.(index) ?? (index % 3 === 0 ? "live_artifact" : index % 3 === 1 ? "synthetic_fixture" : "regression_case"),
      ...(input.reasonFor?.(index) ?? {})
    } satisfies PrivacyRuntimeFindingDatasetExample;
  });
}

const DARK_PATTERN_IDS: PrivacyRuntimeFindingId[] = [
  "reject_button_missing",
  "accept_more_prominent_than_reject",
  "forced_consent_wall",
  "accept_only_banner",
  "dismiss_without_reject"
];

const DISCLOSURE_IDS: PrivacyRuntimeFindingId[] = [
  "consent_gated_tracking_claim_conflict",
  "cookie_disclosure_gap",
  "tracking_technologies_disclosure_present",
  "targeted_advertising_disclosure_present"
];

type ProductionFindingConfig = {
  findingGroup: PrivacyRuntimeFindingGroup;
  findingId: (typeof PRIVACY_RUNTIME_TOP_PRODUCTION_FINDING_IDS)[number];
  positiveEvidenceFor: (index: number) => PrivacyRuntimeEvidence;
  positiveNotes: string;
  signalKey: string;
};

const PRODUCTION_FINDING_CONFIGS: ProductionFindingConfig[] = [
  {
    findingGroup: "disclosure_runtime_mismatch",
    findingId: "consent_gated_tracking_claim_conflict",
    positiveEvidenceFor: (index) => ({
      consentBannerDetectedMs: 700 + index,
      detectionSource: "runtime_policy_bridge",
      policyAnchor: {
        claimType: "consent_gated_tracking_claim",
        confidence: 0.88,
        extractionStatus: "fetched",
        sourceUrl: `https://reviewed-consent-${index}.example.test/privacy`,
        snippet: "We use advertising and analytics cookies only after consent."
      },
      requestUrls: [`https://ads.reviewed-consent-${index}.example.test/collect`],
      runtimeAnchor: {
        confidence: 0.86,
        observationType: "advertising_tracker_before_consent",
        phase: "pre_consent",
        requestUrls: [`https://ads.reviewed-consent-${index}.example.test/collect`],
        vendors: ["Google Ads"]
      },
      sequenceEvidence: true,
      vendors: ["Google Ads"]
    }),
    positiveNotes: "Policy claims consent gating while runtime evidence shows advertising activity before consent.",
    signalKey: "policy_runtime.consent_gated_tracking_claim_conflict"
  },
  {
    findingGroup: "preconsent_tracking",
    findingId: "preconsent_tracking",
    positiveEvidenceFor: (index) => ({
      consentBannerDetectedMs: 650 + index,
      consentSurfaceObserved: true,
      detectionSource: "vendor_signature",
      requestUrls: [`https://analytics.reviewed-preconsent-${index}.example.test/g/collect`],
      sequenceEvidence: true,
      vendorCategories: ["analytics"],
      vendors: ["Google Analytics"]
    }),
    positiveNotes: "Concrete vendor, request URL, and ordering evidence support pre-consent tracking.",
    signalKey: "privacy.preconsent_tracking_detected"
  },
  {
    findingGroup: "preconsent_tracking",
    findingId: "reject_did_not_reduce_tracking",
    positiveEvidenceFor: (index) => ({
      artifactRefs: [`s3://privacy-runtime/reviewed-reject-persistence-${index}/runtime.json`],
      consentActionableChoiceObserved: true,
      consentSurfaceObserved: true,
      detectionSource: "post_reject_runtime_artifact",
      requestUrls: [`https://www.google-analytics.com/g/collect?reviewed=${index}`],
      runtimeAnchor: {
        confidence: 0.9,
        observationType: "tracking_persisted_after_reject",
        phase: "post_reject",
        requestUrls: [`https://www.google-analytics.com/g/collect?reviewed=${index}`],
        vendors: ["Google Analytics"]
      },
      sequenceEvidence: true,
      snapshotEvidence: {
        consent_reject_interaction_succeeded: true,
        post_reject_non_essential_request_count: 1,
        reject_evidence_confirmed: true
      },
      vendorCategories: ["analytics"],
      vendors: ["Google Analytics"]
    }),
    positiveNotes: "Retained reject click and timestamped post-reject non-essential request evidence support tracking persistence after reject.",
    signalKey: "consent_reject_reduced_tracking"
  },
  {
    findingGroup: "production_surfaced_calibration",
    findingId: "weak_cookie_security_attributes",
    positiveEvidenceFor: (index) => ({
      artifactRefs: [`s3://privacy-runtime/reviewed-cookie-${index}/cookies.json`],
      requestUrls: [`https://reviewed-cookie-${index}.example.test/`],
      signalKey: "privacy.weak_cookie_security_attributes_detected",
      snapshotEvidence: {
        cookie_count_total: 8 + index,
        weak_cookie_security_attributes_detected: true
      },
      urlAssessment: {
        assessment: "supports_promotion",
        rationale: "Own URL review treats missing Secure/SameSite coverage on non-essential cookies as promotable only when cookie artifact rows name affected cookies.",
        reviewedAt: "2026-04-24",
        reviewedUrl: `https://reviewed-cookie-${index}.example.test/`
      }
    }),
    positiveNotes: "Cookie artifact rows identify affected cookie names and weak attributes.",
    signalKey: "privacy.weak_cookie_security_attributes_detected"
  },
  {
    findingGroup: "production_surfaced_calibration",
    findingId: "accessibility_support_path_missing",
    positiveEvidenceFor: (index) => ({
      artifactRefs: [`s3://privacy-runtime/reviewed-accessibility-${index}/crawl.json`],
      signalKey: "accessibility.accessibility_support_path_missing",
      snapshotEvidence: {
        accessibility_contact_method_present: false,
        accessibility_statement_present: false
      },
      urlAssessment: {
        assessment: "supports_promotion",
        rationale: "Reviewed public surfaces did not show an accessibility statement or accessibility-specific contact path.",
        reviewedAt: "2026-04-24",
        reviewedUrl: `https://reviewed-accessibility-${index}.example.test/`
      }
    }),
    positiveNotes: "Bounded crawl found no accessibility statement or accessibility support contact path.",
    signalKey: "accessibility.accessibility_support_path_missing"
  },
  {
    findingGroup: "production_surfaced_calibration",
    findingId: "privacy_contact_path_present",
    positiveEvidenceFor: (index) => ({
      artifactRefs: [`s3://privacy-runtime/reviewed-privacy-contact-${index}/policy.json`],
      policyAnchor: {
        claimType: "privacy_contact_channel_present",
        confidence: 0.86,
        extractionStatus: "fetched",
        sourceUrl: `https://reviewed-privacy-contact-${index}.example.test/privacy`,
        snippet: "Contact our privacy team at privacy@example.test for privacy requests."
      },
      signalKey: "privacy.privacy_contact_path_present",
      urlAssessment: {
        assessment: "supports_promotion",
        rationale: "Reviewed privacy URL contains a privacy-specific contact channel rather than a generic support-only contact.",
        reviewedAt: "2026-04-24",
        reviewedUrl: `https://reviewed-privacy-contact-${index}.example.test/privacy`
      }
    }),
    positiveNotes: "Privacy-specific contact channel is present on a retained policy surface.",
    signalKey: "privacy.privacy_contact_path_present"
  },
  {
    findingGroup: "production_surfaced_calibration",
    findingId: "privacy_rights_path_present",
    positiveEvidenceFor: (index) => ({
      artifactRefs: [`s3://privacy-runtime/reviewed-privacy-rights-${index}/policy.json`],
      policyAnchor: {
        claimType: "privacy_rights_path_present",
        confidence: 0.87,
        extractionStatus: "fetched",
        sourceUrl: `https://reviewed-privacy-rights-${index}.example.test/privacy`,
        snippet: "You may request access, deletion, or correction of your personal information through our privacy rights portal."
      },
      signalKey: "privacy.privacy_rights_path_present",
      urlAssessment: {
        assessment: "supports_promotion",
        rationale: "Reviewed privacy URL contains a concrete rights request path, portal, form, or instructions rather than generic rights language only.",
        reviewedAt: "2026-04-24",
        reviewedUrl: `https://reviewed-privacy-rights-${index}.example.test/privacy`
      }
    }),
    positiveNotes: "Privacy-rights request path is present on a retained policy surface.",
    signalKey: "privacy.privacy_rights_path_present"
  },
  {
    findingGroup: "production_surfaced_calibration",
    findingId: "privacy_policy_present",
    positiveEvidenceFor: (index) => ({
      artifactRefs: [`s3://privacy-runtime/reviewed-policy-${index}/policy.html`],
      policyAnchor: {
        claimType: "privacy_policy_surface_present",
        confidence: 0.9,
        extractionStatus: "fetched",
        sourceUrl: `https://reviewed-policy-${index}.example.test/privacy`,
        snippet: "Privacy Policy"
      },
      signalKey: "disclosure.privacy_policy_present",
      urlAssessment: {
        assessment: "supports_promotion",
        rationale: "Reviewed URL is an actual privacy policy or notice surface, not only a footer link or generic legal page.",
        reviewedAt: "2026-04-24",
        reviewedUrl: `https://reviewed-policy-${index}.example.test/privacy`
      }
    }),
    positiveNotes: "Retained, fetched privacy policy surface supports the positive disclosure finding.",
    signalKey: "disclosure.privacy_policy_present"
  },
  {
    findingGroup: "production_surfaced_calibration",
    findingId: "sale_sharing_controls_missing",
    positiveEvidenceFor: (index) => ({
      artifactRefs: [`s3://privacy-runtime/reviewed-sale-sharing-${index}/policy.json`],
      policyAnchor: {
        claimType: "targeted_advertising_without_control",
        confidence: 0.84,
        extractionStatus: "fetched",
        sourceUrl: `https://reviewed-sale-sharing-${index}.example.test/privacy`,
        snippet: "We share identifiers with advertising partners for targeted advertising."
      },
      signalKey: "privacy.sale_sharing_controls_missing",
      snapshotEvidence: {
        do_not_sell_link_present: false,
        targeted_advertising_disclosure_present: true
      },
      urlAssessment: {
        assessment: "supports_promotion",
        rationale: "Reviewed policy discloses sale/sharing or targeted advertising behavior without a visible opt-out control path.",
        reviewedAt: "2026-04-24",
        reviewedUrl: `https://reviewed-sale-sharing-${index}.example.test/privacy`
      }
    }),
    positiveNotes: "Targeted advertising or sale/sharing disclosure is present without a retained opt-out control.",
    signalKey: "privacy.sale_sharing_controls_missing"
  },
  {
    findingGroup: "production_surfaced_calibration",
    findingId: "pricing_or_fee_transparency_unclear",
    positiveEvidenceFor: (index) => ({
      artifactRefs: [`s3://privacy-runtime/reviewed-pricing-${index}/offer.html`],
      policyAnchor: {
        claimType: "fee_claim_without_clear_terms",
        confidence: 0.82,
        extractionStatus: "fetched",
        sourceUrl: `https://reviewed-pricing-${index}.example.test/pricing`,
        snippet: "Start trading with low fees today."
      },
      signalKey: "financial.pricing_or_fee_transparency_unclear",
      urlAssessment: {
        assessment: "supports_promotion",
        rationale: "Reviewed offer page uses fee or pricing claims without adjacent material fee schedule or balancing terms.",
        reviewedAt: "2026-04-24",
        reviewedUrl: `https://reviewed-pricing-${index}.example.test/pricing`
      }
    }),
    positiveNotes: "Pricing or fee claim appears without adjacent material fee-term disclosure.",
    signalKey: "financial.pricing_or_fee_transparency_unclear"
  },
  {
    findingGroup: "production_surfaced_calibration",
    findingId: "tracking_technologies_disclosure_present",
    positiveEvidenceFor: (index) => ({
      artifactRefs: [`s3://privacy-runtime/reviewed-tracking-disclosure-${index}/policy.json`],
      policyAnchor: {
        claimType: "tracking_technologies_disclosure",
        confidence: 0.86,
        extractionStatus: "fetched",
        sourceUrl: `https://reviewed-tracking-disclosure-${index}.example.test/privacy`,
        snippet: "We use cookies, pixels, analytics, web beacons, and similar tracking technologies."
      },
      signalKey: "privacy.tracking_technologies_disclosure_present",
      urlAssessment: {
        assessment: "supports_promotion",
        rationale: "Reviewed policy URL discloses cookies, pixels, analytics, web beacons, or similar tracking technologies.",
        reviewedAt: "2026-04-24",
        reviewedUrl: `https://reviewed-tracking-disclosure-${index}.example.test/privacy`
      }
    }),
    positiveNotes: "Policy text explicitly discloses cookies, pixels, analytics, or similar tracking technologies.",
    signalKey: "privacy.tracking_technologies_disclosure_present"
  },
  {
    findingGroup: "production_surfaced_calibration",
    findingId: "terms_of_service_present",
    positiveEvidenceFor: (index) => ({
      artifactRefs: [`s3://privacy-runtime/reviewed-terms-${index}/terms.html`],
      policyAnchor: {
        claimType: "terms_surface_present",
        confidence: 0.86,
        extractionStatus: "fetched",
        sourceUrl: `https://reviewed-terms-${index}.example.test/terms`,
        snippet: "Terms and Conditions"
      },
      signalKey: "disclosure.terms_of_service_present",
      urlAssessment: {
        assessment: "supports_promotion",
        rationale: "Reviewed URL is a substantive terms, conditions, or user-agreement surface.",
        reviewedAt: "2026-04-24",
        reviewedUrl: `https://reviewed-terms-${index}.example.test/terms`
      }
    }),
    positiveNotes: "Retained terms surface evidence identifies a substantive terms or user-agreement page.",
    signalKey: "disclosure.terms_of_service_present"
  },
  {
    findingGroup: "production_surfaced_calibration",
    findingId: "privacy_contact_channel_missing",
    positiveEvidenceFor: (index) => ({
      artifactRefs: [`s3://privacy-runtime/reviewed-missing-privacy-contact-${index}/crawl.json`],
      signalKey: "privacy.privacy_contact_channel_missing",
      snapshotEvidence: {
        privacy_contact_channel_type: "none",
        verified_public_surfaces_count: 4
      },
      urlAssessment: {
        assessment: "supports_promotion",
        rationale: "Reviewed bounded crawl found privacy/legal surfaces but no privacy-specific contact channel.",
        reviewedAt: "2026-04-24",
        reviewedUrl: `https://reviewed-missing-privacy-contact-${index}.example.test/privacy`
      }
    }),
    positiveNotes: "Bounded privacy/legal crawl found no privacy-specific contact channel.",
    signalKey: "privacy.privacy_contact_channel_missing"
  },
  {
    findingGroup: "production_surfaced_calibration",
    findingId: "targeted_advertising_disclosure_present",
    positiveEvidenceFor: (index) => ({
      artifactRefs: [`s3://privacy-runtime/reviewed-targeted-ad-${index}/policy.json`],
      policyAnchor: {
        claimType: "targeted_advertising_disclosure",
        confidence: 0.86,
        extractionStatus: "fetched",
        sourceUrl: `https://reviewed-targeted-ad-${index}.example.test/privacy`,
        snippet: "We use targeted advertising, personalized ads, interest-based advertising, or cross-context behavioral advertising."
      },
      signalKey: "privacy.targeted_advertising_disclosure_present",
      urlAssessment: {
        assessment: "supports_promotion",
        rationale: "Reviewed policy URL discloses targeted, personalized, interest-based, or cross-context advertising.",
        reviewedAt: "2026-04-24",
        reviewedUrl: `https://reviewed-targeted-ad-${index}.example.test/privacy`
      }
    }),
    positiveNotes: "Policy text explicitly discloses targeted, personalized, interest-based, or cross-context advertising.",
    signalKey: "privacy.targeted_advertising_disclosure_present"
  },
  {
    findingGroup: "production_surfaced_calibration",
    findingId: "third_party_advertising_disclosure_present",
    positiveEvidenceFor: (index) => ({
      artifactRefs: [`s3://privacy-runtime/reviewed-third-party-ad-${index}/policy.json`],
      policyAnchor: {
        claimType: "third_party_advertising_disclosure",
        confidence: 0.86,
        extractionStatus: "fetched",
        sourceUrl: `https://reviewed-third-party-ad-${index}.example.test/privacy`,
        snippet: "We work with third-party advertising partners and ad networks."
      },
      signalKey: "privacy.third_party_advertising_disclosure_present",
      urlAssessment: {
        assessment: "supports_promotion",
        rationale: "Reviewed policy URL discloses third-party advertising partners, ad networks, or advertising service providers.",
        reviewedAt: "2026-04-24",
        reviewedUrl: `https://reviewed-third-party-ad-${index}.example.test/privacy`
      }
    }),
    positiveNotes: "Policy text explicitly discloses third-party advertising partners or ad networks.",
    signalKey: "privacy.third_party_advertising_disclosure_present"
  },
  {
    findingGroup: "production_surfaced_calibration",
    findingId: "unqualified_superlative_claim_detected",
    positiveEvidenceFor: (index) => ({
      artifactRefs: [`s3://privacy-runtime/reviewed-superlative-${index}/offer.html`],
      policyAnchor: {
        claimType: "unqualified_superlative_financial_claim",
        confidence: 0.84,
        extractionStatus: "fetched",
        sourceUrl: `https://reviewed-superlative-${index}.example.test/review`,
        snippet: "The best trading signals and top-performing strategy for investors."
      },
      signalKey: "financial_review.unqualified_superlative_claim_detected",
      urlAssessment: {
        assessment: "supports_promotion",
        rationale: "Reviewed financial page uses best, top, leading, or similar superlative language without nearby qualification.",
        reviewedAt: "2026-04-24",
        reviewedUrl: `https://reviewed-superlative-${index}.example.test/review`
      }
    }),
    positiveNotes: "Financial promotional text contains unqualified superlative language without adjacent qualification.",
    signalKey: "financial_review.unqualified_superlative_claim_detected"
  },
  {
    findingGroup: "production_surfaced_calibration",
    findingId: "children_privacy_disclosure_present",
    positiveEvidenceFor: (index) => ({
      artifactRefs: [`s3://privacy-runtime/reviewed-children-${index}/policy.json`],
      policyAnchor: {
        claimType: "children_privacy_disclosure",
        confidence: 0.86,
        extractionStatus: "fetched",
        sourceUrl: `https://reviewed-children-${index}.example.test/privacy`,
        snippet: "Our services are not directed to children under 13, and we do not knowingly collect children's personal information."
      },
      signalKey: "privacy.children_privacy_disclosure_present",
      urlAssessment: {
        assessment: "supports_promotion",
        rationale: "Reviewed policy URL contains a children privacy or under-13/under-16 disclosure.",
        reviewedAt: "2026-04-24",
        reviewedUrl: `https://reviewed-children-${index}.example.test/privacy`
      }
    }),
    positiveNotes: "Policy text explicitly includes a children privacy disclosure.",
    signalKey: "privacy.children_privacy_disclosure_present"
  },
  {
    findingGroup: "production_surfaced_calibration",
    findingId: "do_not_sell_sharing_disclosure_conflict",
    positiveEvidenceFor: (index) => ({
      artifactRefs: [`s3://privacy-runtime/reviewed-dns-conflict-${index}/runtime.json`],
      policyAnchor: {
        claimType: "do_not_sell_or_share_claim",
        confidence: 0.84,
        extractionStatus: "fetched",
        sourceUrl: `https://reviewed-dns-conflict-${index}.example.test/privacy`,
        snippet: "We do not sell or share personal information."
      },
      runtimeAnchor: {
        confidence: 0.86,
        observationType: "advertising_or_retargeting_stack_observed",
        phase: "unknown",
        requestUrls: [`https://ads.reviewed-dns-conflict-${index}.example.test/collect`],
        vendors: ["Meta Pixel"]
      },
      signalKey: "privacy.do_not_sell_sharing_disclosure_conflict",
      urlAssessment: {
        assessment: "supports_promotion",
        rationale: "Reviewed evidence includes a do-not-sell/share claim plus runtime advertising or retargeting support for a contradiction candidate.",
        reviewedAt: "2026-04-24",
        reviewedUrl: `https://reviewed-dns-conflict-${index}.example.test/privacy`
      },
      vendorCategories: ["advertising"],
      vendors: ["Meta Pixel"]
    }),
    positiveNotes: "Policy do-not-sell/share claim is paired with runtime advertising or retargeting evidence.",
    signalKey: "privacy.do_not_sell_sharing_disclosure_conflict"
  },
  {
    findingGroup: "production_surfaced_calibration",
    findingId: "session_replay_observed",
    positiveEvidenceFor: (index) => ({
      artifactRefs: [`s3://privacy-runtime/reviewed-session-replay-${index}/runtime.json`],
      detectionSource: "runtime_vendor_signature",
      requestUrls: [`https://clarity.reviewed-session-replay-${index}.example.test/collect`],
      signalKey: "privacy.session_replay_runtime_detected",
      snapshotEvidence: {
        session_replay_runtime_detected: true,
        session_replay_vendor_artifact_present: true
      },
      urlAssessment: {
        assessment: "supports_promotion",
        rationale: "Reviewed runtime artifacts identify a session replay vendor or collection endpoint.",
        reviewedAt: "2026-04-24",
        reviewedUrl: `https://reviewed-session-replay-${index}.example.test/`
      },
      vendorCategories: ["session_replay"],
      vendors: ["Microsoft Clarity"]
    }),
    positiveNotes: "Runtime artifacts identify a session replay vendor or collection endpoint.",
    signalKey: "privacy.session_replay_runtime_detected"
  },
  {
    findingGroup: "production_surfaced_calibration",
    findingId: "simulated_performance_without_disclosure",
    positiveEvidenceFor: (index) => ({
      artifactRefs: [`s3://privacy-runtime/reviewed-simulated-performance-${index}/offer.html`],
      policyAnchor: {
        claimType: "simulated_or_backtested_performance_claim",
        confidence: 0.84,
        extractionStatus: "fetched",
        sourceUrl: `https://reviewed-simulated-performance-${index}.example.test/strategy`,
        snippet: "Backtested performance turned $100,000 into $9.1 million."
      },
      signalKey: "financial_review.simulated_performance_without_disclosure",
      urlAssessment: {
        assessment: "supports_promotion",
        rationale: "Reviewed financial page uses backtested, simulated, hypothetical, or model performance language without adjacent simulated-performance disclosure.",
        reviewedAt: "2026-04-24",
        reviewedUrl: `https://reviewed-simulated-performance-${index}.example.test/strategy`
      }
    }),
    positiveNotes: "Financial promotional text contains backtested, simulated, hypothetical, or model performance claims without adjacent qualification.",
    signalKey: "financial_review.simulated_performance_without_disclosure"
  },
  {
    findingGroup: "production_surfaced_calibration",
    findingId: "cookie_disclosure_gap",
    positiveEvidenceFor: (index) => ({
      artifactRefs: [`s3://privacy-runtime/reviewed-cookie-gap-${index}/runtime.json`],
      policyAnchor: {
        claimType: "cookie_policy_partial_or_missing_runtime_coverage",
        confidence: 0.82,
        extractionStatus: "fetched",
        sourceUrl: `https://reviewed-cookie-gap-${index}.example.test/privacy`,
        snippet: "We use cookies for site functionality."
      },
      requestUrls: [`https://analytics.reviewed-cookie-gap-${index}.example.test/collect`],
      runtimeAnchor: {
        confidence: 0.86,
        observationType: "cookie_or_tracker_inventory_exceeds_policy_disclosure",
        phase: "unknown",
        requestUrls: [`https://analytics.reviewed-cookie-gap-${index}.example.test/collect`],
        vendors: ["Google Analytics"]
      },
      signalKey: "privacy.cookie_runtime_disclosure_gap_detected",
      urlAssessment: {
        assessment: "supports_promotion",
        rationale: "Reviewed evidence includes runtime cookie/tracker inventory and policy text that omits or underspecifies matching cookie disclosures.",
        reviewedAt: "2026-04-24",
        reviewedUrl: `https://reviewed-cookie-gap-${index}.example.test/privacy`
      },
      vendorCategories: ["analytics"],
      vendors: ["Google Analytics"]
    }),
    positiveNotes: "Runtime cookie/tracker inventory is materially broader than retained policy disclosure.",
    signalKey: "privacy.cookie_runtime_disclosure_gap_detected"
  },
  {
    findingGroup: "production_surfaced_calibration",
    findingId: "policy_clarity_risk",
    positiveEvidenceFor: (index) => ({
      artifactRefs: [`s3://privacy-runtime/reviewed-policy-clarity-${index}/policy.json`],
      policyAnchor: {
        claimType: "policy_clarity_risk",
        confidence: 0.8,
        extractionStatus: "fetched",
        sourceUrl: `https://reviewed-policy-clarity-${index}.example.test/privacy`,
        snippet: "We may collect information as needed for various business purposes."
      },
      signalKey: "policyAmbiguityScore",
      snapshotEvidence: {
        policy_ambiguity_score: 86,
        privacy_policy_word_count: 180
      },
      urlAssessment: {
        assessment: "supports_promotion",
        rationale: "Reviewed policy is short or vague and retained ambiguity evidence supports a clarity-risk interpretation.",
        reviewedAt: "2026-04-24",
        reviewedUrl: `https://reviewed-policy-clarity-${index}.example.test/privacy`
      }
    }),
    positiveNotes: "Retained policy ambiguity evidence supports policy clarity risk.",
    signalKey: "policyAmbiguityScore"
  },
  {
    findingGroup: "production_surfaced_calibration",
    findingId: "gpc_disclosure_present",
    positiveEvidenceFor: (index) => ({
      artifactRefs: [`s3://privacy-runtime/reviewed-gpc-${index}/policy.json`],
      policyAnchor: {
        claimType: "gpc_disclosure",
        confidence: 0.86,
        extractionStatus: "fetched",
        sourceUrl: `https://reviewed-gpc-${index}.example.test/privacy`,
        snippet: "We recognize Global Privacy Control signals as opt-out requests."
      },
      signalKey: "privacy.gpc_disclosure_present",
      urlAssessment: {
        assessment: "supports_promotion",
        rationale: "Reviewed policy URL discloses Global Privacy Control handling.",
        reviewedAt: "2026-04-24",
        reviewedUrl: `https://reviewed-gpc-${index}.example.test/privacy`
      }
    }),
    positiveNotes: "Policy text explicitly discloses Global Privacy Control handling.",
    signalKey: "privacy.gpc_disclosure_present"
  },
  {
    findingGroup: "production_surfaced_calibration",
    findingId: "arbitration_clause_present",
    positiveEvidenceFor: (index) => ({
      artifactRefs: [`s3://privacy-runtime/reviewed-arbitration-${index}/terms.html`],
      policyAnchor: {
        claimType: "arbitration_clause",
        confidence: 0.86,
        extractionStatus: "fetched",
        sourceUrl: `https://reviewed-arbitration-${index}.example.test/terms`,
        snippet: "Any dispute will be resolved by binding arbitration."
      },
      signalKey: "commerce.arbitration_clause_present",
      urlAssessment: {
        assessment: "supports_promotion",
        rationale: "Reviewed terms URL contains binding arbitration, class-action waiver, or dispute-resolution clause language.",
        reviewedAt: "2026-04-24",
        reviewedUrl: `https://reviewed-arbitration-${index}.example.test/terms`
      }
    }),
    positiveNotes: "Terms text explicitly includes arbitration or binding dispute-resolution language.",
    signalKey: "commerce.arbitration_clause_present"
  },
  {
    findingGroup: "production_surfaced_calibration",
    findingId: "behavioral_analytics_disclosure_present",
    positiveEvidenceFor: (index) => ({
      artifactRefs: [`s3://privacy-runtime/reviewed-behavioral-analytics-${index}/policy.json`],
      policyAnchor: {
        claimType: "behavioral_analytics_disclosure",
        confidence: 0.86,
        extractionStatus: "fetched",
        sourceUrl: `https://reviewed-behavioral-analytics-${index}.example.test/privacy`,
        snippet: "We use behavioral analytics, session recording, heatmaps, and product analytics to understand site use."
      },
      signalKey: "privacy.behavioral_analytics_disclosure_present",
      urlAssessment: {
        assessment: "supports_promotion",
        rationale: "Reviewed policy URL discloses behavioral analytics, session recording, heatmaps, or product analytics.",
        reviewedAt: "2026-04-24",
        reviewedUrl: `https://reviewed-behavioral-analytics-${index}.example.test/privacy`
      }
    }),
    positiveNotes: "Policy text explicitly discloses behavioral analytics, heatmaps, session recording, or product analytics.",
    signalKey: "privacy.behavioral_analytics_disclosure_present"
  },
  {
    findingGroup: "production_surfaced_calibration",
    findingId: "cookie_policy_present",
    positiveEvidenceFor: (index) => ({
      artifactRefs: [`s3://privacy-runtime/reviewed-cookie-policy-${index}/cookies.html`],
      policyAnchor: {
        claimType: "cookie_policy_surface_present",
        confidence: 0.88,
        extractionStatus: "fetched",
        sourceUrl: `https://reviewed-cookie-policy-${index}.example.test/cookie-policy`,
        snippet: "Cookie Policy"
      },
      signalKey: "disclosure.cookie_policy_present",
      urlAssessment: {
        assessment: "supports_promotion",
        rationale: "Reviewed URL is a substantive cookie policy, cookie notice, cookie settings, or privacy choices surface.",
        reviewedAt: "2026-04-24",
        reviewedUrl: `https://reviewed-cookie-policy-${index}.example.test/cookie-policy`
      }
    }),
    positiveNotes: "Retained evidence identifies a substantive cookie policy, cookie notice, or cookie-settings surface.",
    signalKey: "disclosure.cookie_policy_present"
  },
  {
    findingGroup: "production_surfaced_calibration",
    findingId: "missing_transfer_disclosure",
    positiveEvidenceFor: (index) => ({
      artifactRefs: [`s3://privacy-runtime/reviewed-missing-transfer-${index}/section-review.json`],
      policyAnchor: {
        claimType: "missing_transfer_disclosure",
        confidence: 0.82,
        extractionStatus: "fetched",
        sourceUrl: `https://reviewed-missing-transfer-${index}.example.test/privacy`,
        snippet: "The privacy policy describes data sharing but no cross-border transfer mechanism was noted."
      },
      signalKey: "section_review.no_transfer_mechanism_noted",
      snapshotEvidence: {
        policy_transfer_mechanisms_count: 0,
        section_review_no_transfer_mechanism_noted: true
      },
      urlAssessment: {
        assessment: "supports_promotion",
        rationale: "Reviewed primary privacy policy lacks a transfer mechanism, and section-review evidence confirms the absence.",
        reviewedAt: "2026-04-24",
        reviewedUrl: `https://reviewed-missing-transfer-${index}.example.test/privacy`
      }
    }),
    positiveNotes: "Section review found a primary privacy policy but no cross-border transfer mechanism.",
    signalKey: "section_review.no_transfer_mechanism_noted"
  },
  {
    findingGroup: "production_surfaced_calibration",
    findingId: "missing_dsar_mechanism",
    positiveEvidenceFor: (index) => ({
      artifactRefs: [`s3://privacy-runtime/reviewed-missing-dsar-${index}/section-review.json`],
      policyAnchor: {
        claimType: "missing_dsar_mechanism",
        confidence: 0.82,
        extractionStatus: "fetched",
        sourceUrl: `https://reviewed-missing-dsar-${index}.example.test/privacy`,
        snippet: "The privacy policy describes data handling but no access, deletion, correction, or portability request mechanism was noted."
      },
      signalKey: "section_review.no_dsar_mechanism",
      snapshotEvidence: {
        policy_dsar_mechanism: "absent",
        privacy_rights_path_present: false,
        section_review_no_dsar_mechanism: true
      },
      urlAssessment: {
        assessment: "supports_promotion",
        rationale: "Reviewed primary privacy policy lacks a concrete rights request mechanism, and section-review evidence confirms the absence.",
        reviewedAt: "2026-04-24",
        reviewedUrl: `https://reviewed-missing-dsar-${index}.example.test/privacy`
      }
    }),
    positiveNotes: "Section review found a primary privacy policy but no concrete DSAR or privacy-rights request mechanism.",
    signalKey: "section_review.no_dsar_mechanism"
  }
];

const PRODUCTION_REVIEWED_URLS: Record<(typeof PRIVACY_RUNTIME_TOP_PRODUCTION_FINDING_IDS)[number], string> = {
  accessibility_support_path_missing: "https://1000pipbuilder.com/",
  consent_gated_tracking_claim_conflict: "https://www.acorns.com/",
  preconsent_tracking: "https://www.acorns.com/",
  reject_did_not_reduce_tracking: "https://www.hubspot.com/",
  pricing_or_fee_transparency_unclear: "https://backtestr.xyz/",
  privacy_contact_path_present: "https://www.acorns.com/",
  privacy_policy_present: "https://www.acorns.com/",
  privacy_rights_path_present: "https://www.acorns.com/",
  privacy_contact_channel_missing: "https://1000pipbuilder.com/",
  sale_sharing_controls_missing: "https://www.ameriprise.com/",
  targeted_advertising_disclosure_present: "https://www.betterment.com/legal/privacy-policy",
  terms_of_service_present: "https://bestcopytrading.com/terms-and-conditions/",
  tracking_technologies_disclosure_present: "https://bestcopytrading.com/privacy-policy/",
  third_party_advertising_disclosure_present: "https://www.betterment.com/legal/privacy-policy",
  unqualified_superlative_claim_detected: "https://learn2.trade/",
  children_privacy_disclosure_present: "https://www.betterment.com/legal/privacy-policy",
  do_not_sell_sharing_disclosure_conflict: "https://www.discover.com/privacy-statement/",
  session_replay_observed: "https://www.fullstory.com/",
  simulated_performance_without_disclosure: "https://www.grailwealth.com/p/spyholygrailv1",
  cookie_disclosure_gap: "https://www.betterment.com/legal/privacy-policy",
  policy_clarity_risk: "https://atlas-finance.org",
  gpc_disclosure_present: "https://www.betterment.com/legal/privacy-policy",
  arbitration_clause_present: "https://bestcopytrading.com/terms-and-conditions/",
  behavioral_analytics_disclosure_present: "https://www.acorns.com/privacy/",
  cookie_policy_present: "https://ftmo.com/en/cookies/",
  missing_transfer_disclosure: "https://bestforex-signals.com/privacy-policy",
  missing_dsar_mechanism: "https://devbankuk.com/",
  weak_cookie_security_attributes: "https://www.acorns.com/"
};

function productionUrlAssessment(input: {
  assessment: NonNullable<PrivacyRuntimeEvidence["urlAssessment"]>["assessment"];
  findingId: (typeof PRIVACY_RUNTIME_TOP_PRODUCTION_FINDING_IDS)[number];
  rationale: string;
}) {
  return {
    assessment: input.assessment,
    rationale: input.rationale,
    reviewedAt: "2026-04-24",
    reviewedUrl: PRODUCTION_REVIEWED_URLS[input.findingId]
  } satisfies NonNullable<PrivacyRuntimeEvidence["urlAssessment"]>;
}

function makeProductionSurfacedCalibrationExamples() {
  return PRODUCTION_FINDING_CONFIGS.flatMap((config) => [
    ...makeExamples({
      count: 10,
      evidenceFor: (index) => ({
        signalKey: config.signalKey,
        ...config.positiveEvidenceFor(index),
        urlAssessment: {
          assessment: "supports_promotion",
          rationale: "Own URL review found public-page context consistent with this promoted interpretation, and retained artifacts provide the actual signal evidence.",
          reviewedAt: "2026-04-24",
          reviewedUrl: PRODUCTION_REVIEWED_URLS[config.findingId]
        }
      }),
      expectationFor: () => positiveExpectation("high"),
      findingGroup: config.findingGroup,
      findingIds: [config.findingId],
      idPrefix: `prod-top-${config.findingId}-positive`,
      notesFor: () => config.positiveNotes,
      scenarioType: "positive_high_confidence",
      sourceKindFor: (index) => (index % 2 === 0 ? "live_artifact" : "regression_case")
    }),
    ...makeExamples({
      count: 10,
      evidenceFor: (index) => ({
        artifactRefs: index % 2 === 0 ? [`s3://privacy-runtime/${config.findingId}/negative-${index}.json`] : [],
        requestUrls: [`https://production-negative-${config.findingId}-${index}.example.test/`],
        signalKey: config.signalKey,
        snapshotEvidence: {
          [`${config.findingId}_candidate`]: false
        },
        urlAssessment: productionUrlAssessment({
          assessment: "supports_demotion",
          findingId: config.findingId,
          rationale: "Own URL review found that public-page context alone is not enough; absent retained corroborating artifacts, this interpretation should remain suppressed."
        })
      }),
      expectationFor: () => negativeExpectation(),
      findingGroup: config.findingGroup,
      findingIds: [config.findingId],
      idPrefix: `prod-top-${config.findingId}-negative`,
      notesFor: () => "Negative-control URL assessment prevents promotion when the retained evidence does not support the surfaced interpretation.",
      reasonFor: () => ({ negativeControlReason: "Reviewed URL/artifact evidence does not support the production finding interpretation." }),
      scenarioType: "negative_control",
      sourceKindFor: (index) => (index % 2 === 0 ? "live_artifact" : "synthetic_fixture")
    }),
    ...makeExamples({
      count: 10,
      evidenceFor: (index) => ({
        artifactRefs: [`s3://privacy-runtime/${config.findingId}/borderline-${index}.json`],
        policyAnchor: index % 2 === 0 ? {
          claimType: "partial_or_ambiguous_anchor",
          confidence: 0.62,
          extractionStatus: "fetched",
          sourceUrl: `https://production-borderline-${config.findingId}-${index}.example.test/policy`,
          snippet: "Partial evidence suggests this may be relevant, but the operational bridge is incomplete."
        } : undefined,
        requestUrls: index % 3 === 0 ? [`https://production-borderline-${config.findingId}-${index}.example.test/collect`] : [],
        signalKey: config.signalKey,
        urlAssessment: productionUrlAssessment({
          assessment: "borderline",
          findingId: config.findingId,
          rationale: "Own URL review found partial public-page support, but the source, artifact, and policy context do not yet agree enough for external surfacing."
        })
      }),
      expectationFor: () => borderlineExpectation("review"),
      findingGroup: config.findingGroup,
      findingIds: [config.findingId],
      idPrefix: `prod-top-${config.findingId}-borderline`,
      notesFor: () => "Borderline URL assessment keeps the interpretation review-only until the evidence bridge is complete.",
      reasonFor: () => ({ downgradeReason: "Reviewed URL/artifact evidence is partial, ambiguous, or lacks corroboration." }),
      scenarioType: "borderline_review",
      sourceKindFor: (index) => (index % 2 === 0 ? "live_artifact" : "regression_case")
    })
  ]);
}

export const PRIVACY_RUNTIME_PRODUCTION_TOP_FINDINGS_EXAMPLES: PrivacyRuntimeFindingDatasetExample[] =
  makeProductionSurfacedCalibrationExamples();

const BEHAVIORAL_ANALYTICS_CONTEXT_SNIPPETS = [
  "We use behavioral analytics, session recording, and heatmaps to understand how visitors use the site.",
  "Our product analytics tools may record sessions and replay user interactions for service improvement.",
  "We use Hotjar heatmaps and behavior analytics to improve page layouts.",
  "We use FullStory session replay and product analytics to diagnose user experience issues.",
  "We use Mouseflow recordings and heatmaps to analyze user behavior.",
  "We use Contentsquare behavioral analytics to evaluate user journeys.",
  "We use Microsoft Clarity session recordings and heatmaps to improve our website.",
  "We collect behavioral analytics events to understand how visitors interact with pages.",
  "Our analytics providers may create session recordings and heatmaps of site interactions.",
  "We use product analytics and session replay to review clicks, scrolls, and navigation paths."
] as const;

const COOKIE_POLICY_CONTEXT_SNIPPETS = [
  "Cookie Policy: we explain cookie categories, retention periods, and preference controls.",
  "Cookie Settings: users can manage essential, analytics, and advertising cookies.",
  "Our Cookies Notice describes the cookies we use and how to update choices.",
  "Privacy Choices includes cookie preferences and opt-out controls.",
  "The cookie center lists cookie categories, providers, and controls.",
  "Manage Cookies lets visitors adjust analytics and advertising cookie preferences.",
  "Our cookie policy explains similar technologies and links to preference settings.",
  "The privacy center includes a substantive cookie notice and cookie control panel."
] as const;

export const PRIVACY_RUNTIME_POSITIVE_CONTEXT_CALIBRATION_EXAMPLES: PrivacyRuntimeFindingDatasetExample[] = [
  ...makeExamples({
    count: 10,
    evidenceFor: (index) => ({
      artifactRefs: [`s3://privacy-runtime/context-behavioral-analytics/positive-${index}.json`],
      policyAnchor: {
        claimType: "behavioral_analytics_disclosure",
        confidence: 0.86,
        extractionStatus: "fetched",
        sourceUrl: `https://context-behavioral-positive-${index}.example.test/privacy`,
        snippet: BEHAVIORAL_ANALYTICS_CONTEXT_SNIPPETS[index % BEHAVIORAL_ANALYTICS_CONTEXT_SNIPPETS.length]!
      },
      signalKey: "privacy.behavioral_analytics_disclosure_present",
      urlAssessment: {
        assessment: "supports_promotion",
        rationale: "Own URL review found explicit behavioral analytics, session replay, heatmap, product analytics, or named replay-tool disclosure language.",
        reviewedAt: "2026-04-25",
        reviewedUrl: `https://context-behavioral-positive-${index}.example.test/privacy`
      }
    }),
    expectationFor: () => positiveExpectation("high"),
    findingGroup: "production_surfaced_calibration",
    findingIds: ["behavioral_analytics_disclosure_present"],
    idPrefix: "context-behavioral-analytics-positive",
    notesFor: () => "Explicit retained behavioral analytics disclosure text is eligible for main-lane review-level positive context.",
    scenarioType: "positive_high_confidence",
    sourceKindFor: (index) => (index % 2 === 0 ? "live_artifact" : "regression_case")
  }),
  ...makeExamples({
    count: 12,
    evidenceFor: (index) => ({
      artifactRefs: index % 2 === 0 ? [`s3://privacy-runtime/context-behavioral-analytics/negative-${index}.json`] : [],
      policyAnchor: {
        claimType: "generic_analytics_reference",
        confidence: 0.72,
        extractionStatus: "fetched",
        sourceUrl: `https://context-behavioral-negative-${index}.example.test/privacy`,
        snippet: index % 2 === 0
          ? "We use analytics to understand site performance and improve our services."
          : "We may collect usage data and aggregate statistics about visits to our website."
      },
      signalKey: "privacy.behavioral_analytics_disclosure_present",
      urlAssessment: {
        assessment: "supports_demotion",
        rationale: "Own URL review found only generic analytics, site-improvement, usage-data, or cookie analytics language without behavioral/session/heatmap specificity.",
        reviewedAt: "2026-04-25",
        reviewedUrl: `https://context-behavioral-negative-${index}.example.test/privacy`
      }
    }),
    expectationFor: () => negativeExpectation(),
    findingGroup: "production_surfaced_calibration",
    findingIds: ["behavioral_analytics_disclosure_present"],
    idPrefix: "context-behavioral-analytics-negative",
    notesFor: () => "Generic analytics language should not promote a behavioral analytics disclosure interpretation.",
    reasonFor: () => ({ negativeControlReason: "No explicit behavioral analytics, session replay, heatmap, product analytics, or named replay-tool disclosure." }),
    scenarioType: "negative_control",
    sourceKindFor: (index) => (index % 2 === 0 ? "live_artifact" : "synthetic_fixture")
  }),
  ...makeExamples({
    count: 8,
    evidenceFor: (index) => ({
      artifactRefs: index % 2 === 0 ? [`s3://privacy-runtime/context-behavioral-analytics/borderline-${index}.json`] : [],
      policyAnchor: index % 2 === 0 ? {
        claimType: "behavioral_analytics_disclosure_partial",
        confidence: 0.64,
        extractionStatus: index % 4 === 0 ? "parser_incomplete" : "fetched",
        sourceUrl: `https://context-behavioral-borderline-${index}.example.test/privacy`,
        snippet: index % 3 === 0
          ? "We may use tools that help us understand interactions with our website."
          : "Analytics tools may help us review user journeys and page interactions."
      } : undefined,
      signalKey: "privacy.behavioral_analytics_disclosure_present",
      urlAssessment: {
        assessment: "borderline",
        rationale: "Own URL review found partial behavioral-analytics context, but retained evidence lacks a strong snippet, page attribution, or parser quality.",
        reviewedAt: "2026-04-25",
        reviewedUrl: `https://context-behavioral-borderline-${index}.example.test/privacy`
      }
    }),
    expectationFor: () => borderlineExpectation("review"),
    findingGroup: "production_surfaced_calibration",
    findingIds: ["behavioral_analytics_disclosure_present"],
    idPrefix: "context-behavioral-analytics-borderline",
    notesFor: () => "Partial behavioral analytics language remains review-only until retained evidence is explicit and page-attributed.",
    reasonFor: () => ({ downgradeReason: "Retained evidence is partial, parser-incomplete, or lacks explicit behavioral/session/heatmap wording." }),
    scenarioType: "borderline_review",
    sourceKindFor: (index) => (index % 2 === 0 ? "live_artifact" : "regression_case")
  }),
  ...makeExamples({
    count: 8,
    evidenceFor: (index) => ({
      artifactRefs: [`s3://privacy-runtime/context-cookie-policy/support-${index}.json`],
      policyAnchor: {
        claimType: "cookie_policy_surface_present",
        confidence: 0.84,
        extractionStatus: "fetched",
        sourceUrl: `https://context-cookie-support-${index}.example.test/cookie-policy`,
        snippet: COOKIE_POLICY_CONTEXT_SNIPPETS[index % COOKIE_POLICY_CONTEXT_SNIPPETS.length]!
      },
      signalKey: "disclosure.cookie_policy_present",
      snapshotEvidence: {
        cookie_policy_role: "support_context"
      },
      urlAssessment: {
        assessment: "supports_promotion",
        rationale: "Own URL review found a substantive cookie policy, notice, settings, or privacy-choices surface; this should support stronger cookie/tracking findings rather than surface standalone.",
        reviewedAt: "2026-04-25",
        reviewedUrl: `https://context-cookie-support-${index}.example.test/cookie-policy`
      }
    }),
    expectationFor: () => borderlineExpectation("support_only"),
    findingGroup: "production_surfaced_calibration",
    findingIds: ["cookie_policy_present"],
    idPrefix: "context-cookie-policy-support",
    notesFor: () => "Substantive cookie-policy evidence is retained as support context, not as a standalone ranked finding.",
    scenarioType: "positive_moderate",
    sourceKindFor: (index) => (index % 2 === 0 ? "live_artifact" : "regression_case")
  }),
  ...makeExamples({
    count: 14,
    evidenceFor: (index) => ({
      artifactRefs: index % 2 === 0 ? [`s3://privacy-runtime/context-cookie-policy/negative-${index}.json`] : [],
      policyAnchor: index % 3 === 0 ? {
        claimType: "thin_cookie_reference",
        confidence: 0.58,
        extractionStatus: "fetched",
        sourceUrl: `https://context-cookie-negative-${index}.example.test/privacy`,
        snippet: "This site may use cookies."
      } : undefined,
      requestUrls: index % 4 === 0 ? [`https://context-cookie-negative-${index}.example.test/`] : [],
      signalKey: "disclosure.cookie_policy_present",
      snapshotEvidence: {
        cookie_policy_candidate: false
      },
      urlAssessment: {
        assessment: "supports_demotion",
        rationale: "Own URL review found a footer cookie mention, dead cookie link, banner-only reference, or generic privacy page without a substantive cookie surface.",
        reviewedAt: "2026-04-25",
        reviewedUrl: `https://context-cookie-negative-${index}.example.test/`
      }
    }),
    expectationFor: () => negativeExpectation(),
    findingGroup: "production_surfaced_calibration",
    findingIds: ["cookie_policy_present"],
    idPrefix: "context-cookie-policy-negative",
    notesFor: () => "Thin cookie mentions or dead/non-substantive cookie surfaces should not count as retained cookie-policy support.",
    reasonFor: () => ({ negativeControlReason: "No substantive cookie policy, cookie settings, cookie notice, or privacy-choices surface was retained." }),
    scenarioType: "negative_control",
    sourceKindFor: (index) => (index % 2 === 0 ? "live_artifact" : "synthetic_fixture")
  }),
  ...makeExamples({
    count: 8,
    evidenceFor: (index) => ({
      artifactRefs: index % 2 === 0 ? [`s3://privacy-runtime/context-cookie-policy/borderline-${index}.json`] : [],
      policyAnchor: {
        claimType: "partial_cookie_surface",
        confidence: 0.63,
        extractionStatus: index % 3 === 0 ? "parser_incomplete" : "fetched",
        sourceUrl: `https://context-cookie-borderline-${index}.example.test/privacy`,
        snippet: index % 2 === 0
          ? "We use cookies and similar technologies as described in this privacy notice."
          : "A cookie banner was observed, but no retained cookie-settings destination was captured."
      },
      signalKey: "disclosure.cookie_policy_present",
      snapshotEvidence: {
        cookie_policy_role: "ambiguous_support_context"
      },
      urlAssessment: {
        assessment: "borderline",
        rationale: "Own URL review found partial cookie language or a banner, but retained evidence does not prove a substantive first-party cookie policy/settings surface.",
        reviewedAt: "2026-04-25",
        reviewedUrl: `https://context-cookie-borderline-${index}.example.test/privacy`
      }
    }),
    expectationFor: () => borderlineExpectation("support_only"),
    findingGroup: "production_surfaced_calibration",
    findingIds: ["cookie_policy_present"],
    idPrefix: "context-cookie-policy-borderline",
    notesFor: () => "Partial cookie evidence remains support-only/audit-only until a substantive first-party surface is retained.",
    reasonFor: () => ({ downgradeReason: "Cookie evidence is partial, parser-incomplete, banner-only, or lacks a retained settings/policy destination." }),
    scenarioType: "borderline_audit_only",
    sourceKindFor: (index) => (index % 2 === 0 ? "live_artifact" : "regression_case")
  })
];

export const PRIVACY_RUNTIME_DSAR_ABSENCE_CALIBRATION_EXAMPLES: PrivacyRuntimeFindingDatasetExample[] = [
  ...makeExamples({
    count: 10,
    evidenceFor: (index) => ({
      artifactRefs: [`s3://privacy-runtime/dsar-absence/positive-${index}/policy-enrichment.json`],
      policyAnchor: {
        claimType: "missing_dsar_mechanism",
        confidence: 0.84,
        extractionStatus: "fetched",
        sourceUrl: `https://dsar-absence-positive-${index}.example.test/privacy`,
        snippet: "The privacy policy describes personal data handling but no access, deletion, correction, portability, or privacy request mechanism was identified."
      },
      signalKey: "section_review.no_dsar_mechanism",
      snapshotEvidence: {
        policy_dsar_mechanism: "absent",
        policy_extraction_status: "fetched",
        policy_rights_signals: [],
        policy_semantic_confidence: 0.84,
        section_review_no_dsar_mechanism: true
      },
      urlAssessment: {
        assessment: "supports_promotion",
        rationale: "Own URL review found a fetched primary privacy policy with explicit absence evidence and no retained privacy-rights request path.",
        reviewedAt: "2026-04-25",
        reviewedUrl: `https://dsar-absence-positive-${index}.example.test/privacy`
      }
    }),
    expectationFor: () => positiveExpectation("high"),
    findingGroup: "production_surfaced_calibration",
    findingIds: ["missing_dsar_mechanism"],
    idPrefix: "dsar-absence-positive",
    notesFor: () => "Fetched policy, high-confidence enrichment, and explicit DSAR absence metadata support confirmed missing DSAR mechanism.",
    scenarioType: "positive_high_confidence",
    sourceKindFor: (index) => (index % 2 === 0 ? "regression_case" : "live_artifact")
  }),
  ...makeExamples({
    count: 10,
    evidenceFor: (index) => ({
      artifactRefs: [`s3://privacy-runtime/dsar-absence/negative-${index}/policy-enrichment.json`],
      policyAnchor: {
        claimType: "privacy_rights_mechanism_present",
        confidence: 0.86,
        extractionStatus: "fetched",
        sourceUrl: `https://dsar-absence-negative-${index}.example.test/privacy-rights`,
        snippet: "Submit a privacy request form to request access, deletion, correction, or portability of your personal information."
      },
      signalKey: "section_review.no_dsar_mechanism",
      snapshotEvidence: {
        policy_dsar_mechanism: index % 2 === 0 ? "form" : "privacy_contact",
        policy_extraction_status: "fetched",
        policy_rights_signals: ["access_request", "delete_request"],
        policy_semantic_confidence: 0.86,
        privacy_rights_path_present: true
      },
      urlAssessment: {
        assessment: "supports_demotion",
        rationale: "Own URL review found an access/deletion request form, privacy-rights portal, or privacy-specific request contact.",
        reviewedAt: "2026-04-25",
        reviewedUrl: `https://dsar-absence-negative-${index}.example.test/privacy-rights`
      }
    }),
    expectationFor: () => negativeExpectation(),
    findingGroup: "production_surfaced_calibration",
    findingIds: ["missing_dsar_mechanism"],
    idPrefix: "dsar-absence-negative",
    notesFor: () => "Concrete retained DSAR mechanism evidence should suppress the missing-DSAR interpretation.",
    reasonFor: () => ({ negativeControlReason: "Retained policy evidence identifies an actionable privacy-rights request mechanism." }),
    scenarioType: "negative_control",
    sourceKindFor: (index) => (index % 2 === 0 ? "regression_case" : "synthetic_fixture")
  }),
  ...makeExamples({
    count: 10,
    evidenceFor: (index) => ({
      artifactRefs: index % 2 === 0 ? [`s3://privacy-runtime/dsar-absence/borderline-${index}/policy-enrichment.json`] : [],
      policyAnchor: {
        claimType: "possible_missing_dsar_mechanism",
        confidence: 0.62,
        extractionStatus: index % 2 === 0 ? "parser_incomplete" : "fetched",
        sourceUrl: `https://dsar-absence-borderline-${index}.example.test/privacy`,
        snippet: index % 2 === 0
          ? "Policy extraction was incomplete around privacy-rights language."
          : "The policy mentions privacy rights but does not retain a request form, portal, or privacy-specific contact."
      },
      signalKey: "section_review.no_dsar_mechanism",
      snapshotEvidence: {
        policy_dsar_mechanism: index % 2 === 0 ? "unknown" : "absent",
        policy_extraction_status: index % 2 === 0 ? "parser_incomplete" : "fetched",
        policy_rights_signals: index % 3 === 0 ? ["access_request"] : [],
        policy_semantic_confidence: index % 2 === 0 ? 0.58 : 0.68
      },
      urlAssessment: {
        assessment: "borderline",
        rationale: "Own URL review found partial, parser-incomplete, or internally inconsistent DSAR evidence.",
        reviewedAt: "2026-04-25",
        reviewedUrl: `https://dsar-absence-borderline-${index}.example.test/privacy`
      }
    }),
    expectationFor: () => borderlineExpectation("review"),
    findingGroup: "production_surfaced_calibration",
    findingIds: ["missing_dsar_mechanism"],
    idPrefix: "dsar-absence-borderline",
    notesFor: () => "Parser-incomplete or mixed DSAR evidence remains review-only until explicit absence and no mechanism evidence agree.",
    reasonFor: () => ({ downgradeReason: "Missing complete fetched-policy absence evidence or contradicted by retained rights signals." }),
    scenarioType: "borderline_review",
    sourceKindFor: (index) => (index % 2 === 0 ? "regression_case" : "synthetic_fixture")
  })
];

export const PRIVACY_RUNTIME_FINDINGS_DATASET_SEED_BASE: PrivacyRuntimeFindingDatasetExample[] = [
  ...makeExamples({
    count: 18,
    evidenceFor: (index) => ({
      consentActionableChoiceObserved: true,
      consentBannerDetectedMs: 900 + index,
      consentSurfaceObserved: true,
      detectionSource: index % 2 === 0 ? "vendor_signature" : "sanitized_network",
      requestUrls: [`https://track${index}.example.test/collect`],
      sequenceEvidence: true,
      vendorCategories: [index % 2 === 0 ? "advertising" : "analytics"],
      vendors: [index % 2 === 0 ? "Meta Pixel" : "Google Analytics"]
    }),
    expectationFor: () => positiveExpectation("high"),
    findingGroup: "preconsent_tracking",
    findingIds: ["preconsent_tracking"],
    idPrefix: "preconsent-positive",
    notesFor: () => "Concrete vendor, request URL, and consent timing evidence support confirmed pre-consent tracking.",
    scenarioType: "positive_high_confidence"
  }),
  ...makeExamples({
    count: 18,
    evidenceFor: (index) => ({
      consentBannerDetectedMs: 850 + index,
      consentSurfaceObserved: index % 2 === 0,
      detectionSource: index % 2 === 0 ? "functional_allowlist" : "post_accept_only",
      requestUrls: index % 2 === 0 ? [`https://cdn${index}.example.test/app.js`] : [],
      sequenceEvidence: index % 2 !== 0,
      vendorCategories: [index % 2 === 0 ? "functional" : "analytics"],
      vendors: [index % 2 === 0 ? "Cloudflare" : "Google Analytics"]
    }),
    expectationFor: () => negativeExpectation(),
    findingGroup: "preconsent_tracking",
    findingIds: ["preconsent_tracking"],
    idPrefix: "preconsent-negative",
    notesFor: () => "Functional-only, post-consent, or non-concrete evidence should not surface as pre-consent tracking.",
    reasonFor: () => ({ negativeControlReason: "No non-essential tracker with both timing and concrete runtime artifact." }),
    scenarioType: "negative_control"
  }),
  ...makeExamples({
    count: 9,
    evidenceFor: (index) => ({
      consentBannerDetectedMs: 1000,
      consentSurfaceObserved: true,
      detectionSource: index % 2 === 0 ? "vendor_signature" : "sanitized_network",
      requestUrls: index % 2 === 0 ? [] : [`https://unknown${index}.example.test/pixel`],
      sequenceEvidence: index !== 8,
      vendorCategories: [index % 2 === 0 ? "advertising" : "unknown"],
      vendors: index % 2 === 0 ? ["Meta Pixel"] : []
    }),
    expectationFor: () => borderlineExpectation("review"),
    findingGroup: "preconsent_tracking",
    findingIds: ["preconsent_tracking"],
    idPrefix: "preconsent-borderline",
    notesFor: () => "Partial pre-consent evidence should remain review or audit-only until corroborated.",
    reasonFor: () => ({ downgradeReason: "Missing either concrete vendor, concrete URL, or complete timing sequence." }),
    scenarioType: "borderline_review"
  }),
  ...makeExamples({
    count: 10,
    evidenceFor: (index) => ({
      artifactRefs: [`s3://privacy-runtime/preconsent-cookie/positive-${index}/cookies.json`],
      consentBannerDetectedMs: 700 + index,
      consentSurfaceObserved: true,
      detectionSource: index % 2 === 0 ? "cookie_write_observation" : "initial_cookie_snapshot",
      sequenceEvidence: true,
      signalKey: "privacy.preconsent_tracking_detected",
      snapshotEvidence: {
        preconsent_cookie_categories: [index % 2 === 0 ? "advertising" : "analytics"],
        preconsent_cookie_names: [index % 2 === 0 ? "_fbp" : "_ga"],
        preconsent_cookie_timing_evidence: index % 2 === 0 ? "before_consent_cookie_write" : "initial_cookie_snapshot",
        preconsent_nonessential_cookie_names: [index % 2 === 0 ? "_fbp" : "_ga"],
        preconsent_tracking_detected: true
      }
    }),
    expectationFor: () => positiveExpectation("high"),
    findingGroup: "preconsent_tracking",
    findingIds: ["preconsent_tracking"],
    idPrefix: "preconsent-cookie-positive",
    notesFor: () => "Non-essential analytics or advertising cookie was written before consent with retained timing evidence.",
    scenarioType: "positive_high_confidence",
    sourceKindFor: (index) => (index % 2 === 0 ? "regression_case" : "synthetic_fixture")
  }),
  ...makeExamples({
    count: 10,
    evidenceFor: (index) => ({
      artifactRefs: index % 2 === 0 ? [`s3://privacy-runtime/preconsent-cookie/negative-${index}/cookies.json`] : [],
      consentBannerDetectedMs: 720 + index,
      consentSurfaceObserved: true,
      detectionSource: index % 2 === 0 ? "cookie_write_observation" : "functional_allowlist",
      sequenceEvidence: true,
      signalKey: "privacy.preconsent_tracking_detected",
      snapshotEvidence: {
        preconsent_cookie_categories: [index % 2 === 0 ? "necessary" : "security"],
        preconsent_cookie_names: [index % 2 === 0 ? "__cf_bm" : "JSESSIONID"],
        preconsent_cookie_timing_evidence: "before_consent_cookie_write",
        preconsent_tracking_detected: true
      }
    }),
    expectationFor: () => negativeExpectation(),
    findingGroup: "preconsent_tracking",
    findingIds: ["preconsent_tracking"],
    idPrefix: "preconsent-cookie-negative",
    notesFor: () => "Necessary, security, or session cookies before consent should not surface as tracking.",
    reasonFor: () => ({ negativeControlReason: "Cookie evidence is limited to necessary/security/session behavior with no non-essential cookie classification." }),
    scenarioType: "negative_control",
    sourceKindFor: (index) => (index % 2 === 0 ? "regression_case" : "synthetic_fixture")
  }),
  ...makeExamples({
    count: 10,
    evidenceFor: (index) => ({
      artifactRefs: index % 2 === 0 ? [`s3://privacy-runtime/preconsent-cookie/borderline-${index}/cookies.json`] : [],
      consentBannerDetectedMs: 760 + index,
      consentSurfaceObserved: true,
      detectionSource: index % 2 === 0 ? "cookie_name_inference" : "cookie_snapshot_without_sequence",
      sequenceEvidence: index % 2 === 0,
      signalKey: "privacy.preconsent_tracking_detected",
      snapshotEvidence: {
        preconsent_cookie_categories: [index % 2 === 0 ? "unknown" : "analytics"],
        preconsent_cookie_names: [index % 2 === 0 ? "visitor_id" : "_gid"],
        preconsent_tracking_detected: true
      }
    }),
    expectationFor: () => borderlineExpectation("review"),
    findingGroup: "preconsent_tracking",
    findingIds: ["preconsent_tracking"],
    idPrefix: "preconsent-cookie-borderline",
    notesFor: () => "Cookie hints without non-essential classification or timing sequence remain review-only.",
    reasonFor: () => ({ downgradeReason: "Missing either explicit non-essential cookie classification or complete before-consent timing evidence." }),
    scenarioType: "borderline_review",
    sourceKindFor: (index) => (index % 2 === 0 ? "regression_case" : "synthetic_fixture")
  }),
  ...makeExamples({
    count: 18,
    evidenceFor: (index) => ({
      attributeCategories: index % 2 === 0 ? ["canvas_webgl", "audio_context", "device_memory"] : ["canvas_webgl", "font_metrics"],
      detectionSource: index % 2 === 0 ? "fingerprint_summary" : "script_signature",
      fingerprintConfidence: "high",
      fingerprintTier: index % 3 === 0 ? 3 : 2,
      requestUrls: [`https://fp${index}.example.test/collect`],
      scriptHosts: [`fp-script${index}.example.test`],
      vendors: [index % 2 === 0 ? "FingerprintJS" : "ThreatMetrix"]
    }),
    expectationFor: () => positiveExpectation("high"),
    findingGroup: "fingerprinting",
    findingIds: ["fingerprinting_observed"],
    idPrefix: "fingerprinting-positive",
    notesFor: () => "High-tier or corroborated tier-2 fingerprinting evidence supports surfacing.",
    scenarioType: "positive_high_confidence"
  }),
  ...makeExamples({
    count: 18,
    evidenceFor: (index) => ({
      attributeCategories: index % 3 === 0 ? ["user_agent"] : [],
      detectionSource: index % 2 === 0 ? "browser_capability_check" : "fraud_security_context",
      fingerprintConfidence: "low",
      fingerprintTier: index % 3 === 0 ? 1 : 0,
      requestUrls: index % 2 === 0 ? [] : [`https://security${index}.example.test/challenge`],
      vendorCategories: ["functional"],
      vendors: index % 2 === 0 ? [] : ["Akamai Bot Manager"]
    }),
    expectationFor: () => negativeExpectation(),
    findingGroup: "fingerprinting",
    findingIds: ["fingerprinting_observed"],
    idPrefix: "fingerprinting-negative",
    notesFor: () => "Generic telemetry, low-tier summaries, or functional security context should not become fingerprinting findings.",
    reasonFor: () => ({ negativeControlReason: "No high-entropy fingerprinting cluster with non-functional corroboration." }),
    scenarioType: "negative_control"
  }),
  ...makeExamples({
    count: 9,
    evidenceFor: (index) => ({
      attributeCategories: index % 2 === 0 ? ["canvas_webgl"] : [],
      detectionSource: "fingerprint_summary",
      fingerprintConfidence: "medium",
      fingerprintTier: 2,
      requestUrls: index % 2 === 0 ? [] : [`https://fp-borderline${index}.example.test/collect`],
      scriptHosts: index % 2 === 0 ? [`fp-borderline${index}.example.test`] : []
    }),
    expectationFor: () => borderlineExpectation("review"),
    findingGroup: "fingerprinting",
    findingIds: ["fingerprinting_observed"],
    idPrefix: "fingerprinting-borderline",
    notesFor: () => "Tier-2 fingerprinting hints without full corroboration should stay review or audit-only.",
    reasonFor: () => ({ downgradeReason: "Tier-2 evidence is missing either attribute diversity, script, vendor, or request support." }),
    scenarioType: "borderline_review"
  }),
  ...makeExamples({
    count: 24,
    evidenceFor: (index) => ({
      artifactRefs: [`s3://privacy-runtime/dark-pattern/${index}.png`],
      consentActionableChoiceObserved: true,
      consentSurfaceObserved: true,
      uiFacts: ["banner_present", DARK_PATTERN_IDS[index % DARK_PATTERN_IDS.length]!],
      visualFacts: index % 2 === 0 ? ["cta_imbalance", "reject_low_prominence"] : ["interaction_blocked"]
    }),
    expectationFor: () => positiveExpectation("moderate"),
    findingGroup: "dark_pattern_consent",
    findingIds: DARK_PATTERN_IDS,
    idPrefix: "dark-pattern-positive",
    notesFor: () => "Verified consent surface plus specific UI and artifact evidence supports review-level surfacing.",
    scenarioType: "positive_moderate"
  }),
  ...makeExamples({
    count: 24,
    evidenceFor: (index) => ({
      artifactRefs: index % 4 === 0 ? [] : [`s3://privacy-runtime/dark-pattern-negative/${index}.png`],
      consentActionableChoiceObserved: index % 3 !== 0,
      consentSurfaceObserved: index % 2 !== 0,
      uiFacts: index % 2 === 0 ? ["no_consent_surface"] : ["equal_accept_reject"],
      visualFacts: index % 2 === 0 ? [] : ["balanced_ctas"]
    }),
    expectationFor: () => negativeExpectation(),
    findingGroup: "dark_pattern_consent",
    findingIds: DARK_PATTERN_IDS,
    idPrefix: "dark-pattern-negative",
    notesFor: () => "No verified consent surface, balanced controls, or incomplete extraction should not surface dark-pattern findings.",
    reasonFor: () => ({ negativeControlReason: "Missing verified consent surface or specific dark-pattern UI fact." }),
    scenarioType: "negative_control"
  }),
  ...makeExamples({
    count: 12,
    evidenceFor: (index) => ({
      artifactRefs: index % 2 === 0 ? [] : [`s3://privacy-runtime/dark-pattern-borderline/${index}.png`],
      consentActionableChoiceObserved: true,
      consentSurfaceObserved: true,
      uiFacts: ["banner_present", "choice_available_deeper_layer"],
      visualFacts: index % 2 === 0 ? ["possible_cta_imbalance"] : ["overlay_with_equal_choices"]
    }),
    expectationFor: () => borderlineExpectation("review"),
    findingGroup: "dark_pattern_consent",
    findingIds: DARK_PATTERN_IDS,
    idPrefix: "dark-pattern-borderline",
    notesFor: () => "Ambiguous choice architecture should be retained for review without confirmed language.",
    reasonFor: () => ({ downgradeReason: "UI evidence is plausible but lacks enough artifact or interaction corroboration." }),
    scenarioType: "borderline_review"
  }),
  ...makeExamples({
    count: 12,
    evidenceFor: (index) => ({
      nanoPolicyAnchor: {
        confidence: 0.82,
        pageUrl: `https://example${index}.test/privacy`,
        snippet: "We only use advertising cookies after you consent.",
        topic: index % 2 === 0 ? "tracking_technologies_disclosure" : "targeted_advertising_disclosure"
      },
      policyAnchor: {
        claimType: index % 2 === 0 ? "consent_gated_tracking_claim" : "cookie_disclosure_scope",
        confidence: 0.84,
        extractionStatus: "fetched",
        sourceUrl: `https://example${index}.test/privacy`,
        snippet: "Advertising and analytics tracking are used only after consent."
      },
      runtimeAnchor: {
        confidence: 0.88,
        observationType: "tracker_runtime_observed",
        phase: "pre_consent",
        requestUrls: [`https://ads${index}.example.test/pixel`],
        vendors: ["Meta Pixel"]
      }
    }),
    expectationFor: () => positiveExpectation("high"),
    findingGroup: "disclosure_runtime_mismatch",
    findingIds: DISCLOSURE_IDS,
    idPrefix: "disclosure-positive",
    notesFor: () => "Policy/Nano anchor plus runtime anchor supports disclosure or consent-gating mismatch.",
    scenarioType: "positive_high_confidence",
    sourceKindFor: (index) => (index % 2 === 0 ? "nano_review" : "live_artifact")
  }),
  ...makeExamples({
    count: 12,
    evidenceFor: (index) => ({
      nanoPolicyAnchor: index % 2 === 0 ? undefined : {
        confidence: 0.78,
        pageUrl: `https://covered${index}.example.test/privacy`,
        snippet: "We use cookies, pixels, tags, and advertising partners for measurement and personalization.",
        topic: "tracking_technologies_disclosure"
      },
      policyAnchor: {
        claimType: "tracking_disclosure_covers_observed_behavior",
        confidence: 0.82,
        extractionStatus: index % 3 === 0 ? "parser_incomplete" : "fetched",
        sourceUrl: `https://covered${index}.example.test/privacy`,
        snippet: "We use cookies, pixels, tags, and advertising partners for measurement and personalization."
      },
      runtimeAnchor: index % 2 === 0 ? undefined : {
        confidence: 0.5,
        observationType: "tracker_runtime_observed",
        phase: "unknown",
        vendors: ["Google Analytics"]
      }
    }),
    expectationFor: () => negativeExpectation(),
    findingGroup: "disclosure_runtime_mismatch",
    findingIds: DISCLOSURE_IDS,
    idPrefix: "disclosure-negative",
    notesFor: () => "Covered behavior, incomplete policy fetches, or incomplete runtime anchors should not confirm mismatch.",
    reasonFor: () => ({ negativeControlReason: "No complete policy/runtime contradiction anchor." }),
    scenarioType: "negative_control"
  }),
  ...makeExamples({
    count: 6,
    evidenceFor: (index) => ({
      nanoPolicyAnchor: {
        confidence: 0.66,
        pageUrl: `https://borderline${index}.example.test/privacy`,
        snippet: "We may use cookies for analytics and advertising.",
        topic: "tracking_technologies_disclosure"
      },
      policyAnchor: {
        claimType: "vague_tracking_disclosure",
        confidence: 0.62,
        extractionStatus: "fetched",
        sourceUrl: `https://borderline${index}.example.test/privacy`,
        snippet: "We may use cookies for analytics and advertising."
      },
      runtimeAnchor: {
        confidence: 0.61,
        observationType: "tracker_runtime_observed",
        phase: index % 2 === 0 ? "pre_consent" : "unknown",
        requestUrls: index % 2 === 0 ? [`https://ads-borderline${index}.example.test/pixel`] : [],
        vendors: ["Meta Pixel"]
      }
    }),
    expectationFor: () => borderlineExpectation("review"),
    findingGroup: "disclosure_runtime_mismatch",
    findingIds: DISCLOSURE_IDS,
    idPrefix: "disclosure-borderline",
    notesFor: () => "Partial policy/runtime mismatch evidence should stay review-level until the bridge is explicit.",
    reasonFor: () => ({ downgradeReason: "Missing explicit contradiction bridge or strong policy/runtime anchor." }),
    scenarioType: "borderline_review",
    sourceKindFor: () => "nano_review"
  })
];

export const PRIVACY_RUNTIME_FINDINGS_DATASET_SEED: PrivacyRuntimeFindingDatasetExample[] = [
  ...PRIVACY_RUNTIME_FINDINGS_DATASET_SEED_BASE,
  ...PRIVACY_RUNTIME_PRODUCTION_TOP_FINDINGS_EXAMPLES,
  ...PRIVACY_RUNTIME_POSITIVE_CONTEXT_CALIBRATION_EXAMPLES,
  ...PRIVACY_RUNTIME_DSAR_ABSENCE_CALIBRATION_EXAMPLES,
  ...PRIVACY_RUNTIME_FINDINGS_REVIEWED_EXAMPLES
];

function emptyCounts<T extends string>(keys: readonly T[]) {
  return Object.fromEntries(keys.map((key) => [key, 0])) as Record<T, number>;
}

function increment<T extends string>(counts: Record<T, number>, key: T) {
  counts[key] = (counts[key] ?? 0) + 1;
}

export function summarizePrivacyRuntimeFindingsDataset(
  examples: PrivacyRuntimeFindingDatasetExample[] = PRIVACY_RUNTIME_FINDINGS_DATASET_SEED
): PrivacyRuntimeFindingDatasetSummary {
  const findingCounts = emptyCounts(PRIVACY_RUNTIME_FINDING_IDS);
  const groupCounts = emptyCounts(PRIVACY_RUNTIME_FINDING_GROUPS);
  const scenarioCounts = emptyCounts(PRIVACY_RUNTIME_SCENARIO_TYPES);
  const sourceKindCounts = emptyCounts(PRIVACY_RUNTIME_SOURCE_KINDS);
  const expectedPresentationCounts = emptyCounts(["confirmed", "review", "support_only", "suppressed"] as const);
  const expectedConfidenceCounts = emptyCounts(["high", "moderate", "low"] as const);

  for (const example of examples) {
    increment(findingCounts, example.findingId);
    increment(groupCounts, example.findingGroup);
    increment(scenarioCounts, example.scenarioType);
    increment(sourceKindCounts, example.sourceKind);
    increment(expectedPresentationCounts, example.expected.presentationState);
    increment(expectedConfidenceCounts, example.expected.confidenceBand);
  }

  return {
    borderlineCount: scenarioCounts.borderline_review + scenarioCounts.borderline_audit_only,
    currentExampleCount: examples.length,
    expectedConfidenceCounts,
    expectedPresentationCounts,
    findingCounts,
    groupCounts,
    negativeCount: scenarioCounts.negative_control,
    positiveCount: scenarioCounts.positive_high_confidence + scenarioCounts.positive_moderate,
    scenarioCounts,
    sourceKindCounts
  };
}
