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
  "targeted_advertising_disclosure_present"
] as const;

export const PRIVACY_RUNTIME_FINDING_GROUPS = [
  "preconsent_tracking",
  "fingerprinting",
  "dark_pattern_consent",
  "disclosure_runtime_mismatch"
] as const;

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
  uiFacts?: string[];
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

export const PRIVACY_RUNTIME_FINDINGS_DATASET_SEED: PrivacyRuntimeFindingDatasetExample[] = [
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
