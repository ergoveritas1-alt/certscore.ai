import { PRIVACY_RUNTIME_FINDINGS_REVIEWED_EXAMPLES } from "./privacy-runtime-findings.reviewed";

export const PRIVACY_RUNTIME_FINDING_IDS = [
  "preconsent_tracking",
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
  "privacy_contact_path_present",
  "privacy_policy_present",
  "sale_sharing_controls_missing",
  "pricing_or_fee_transparency_unclear"
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
  "weak_cookie_security_attributes",
  "accessibility_support_path_missing",
  "privacy_contact_path_present",
  "privacy_policy_present",
  "sale_sharing_controls_missing",
  "pricing_or_fee_transparency_unclear"
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
    phase: "pre_consent" | "post_accept" | "unknown";
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
  }
];

const PRODUCTION_REVIEWED_URLS: Record<(typeof PRIVACY_RUNTIME_TOP_PRODUCTION_FINDING_IDS)[number], string> = {
  accessibility_support_path_missing: "https://1000pipbuilder.com/",
  consent_gated_tracking_claim_conflict: "https://www.acorns.com/",
  preconsent_tracking: "https://www.acorns.com/",
  pricing_or_fee_transparency_unclear: "https://backtestr.xyz/",
  privacy_contact_path_present: "https://www.acorns.com/",
  privacy_policy_present: "https://www.acorns.com/",
  sale_sharing_controls_missing: "https://www.ameriprise.com/",
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
