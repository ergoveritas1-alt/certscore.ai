import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  type CanonicalEvidenceBundle,
  SCHEMA_VERSION,
} from "../packages/certscore-contracts/src/index.js";
import { reviewEvidenceBundle } from "../packages/certscore-review-engine/src/index.js";
import {
  analyticsCollectionJourney,
  analyticsRequestEvent,
  doubleClickVendor,
  googleAnalyticsVendor,
  minimalBundle,
  preConsentCookieEvent,
  preConsentCookieJourney,
} from "../packages/certscore-review-engine/src/fixtures.js";

type Args = {
  failOnMissing: boolean;
  help: boolean;
  outDir: string;
  stage2Dir: string;
};

type JsonRecord = Record<string, any>;

const fixtureMinimalBundle = minimalBundle as unknown as (overrides: JsonRecord) => JsonRecord;
const fixtureAnalyticsRequestEvent = analyticsRequestEvent as unknown as JsonRecord;
const fixturePreConsentCookieEvent = preConsentCookieEvent as unknown as JsonRecord;
const fixtureAnalyticsCollectionJourney = analyticsCollectionJourney as unknown as () => JsonRecord;
const fixturePreConsentCookieJourney = preConsentCookieJourney as unknown as () => JsonRecord;
const fixtureGoogleAnalyticsVendor = googleAnalyticsVendor as unknown as () => JsonRecord;
const fixtureDoubleClickVendor = doubleClickVendor as unknown as () => JsonRecord;

type FixtureDefinition = {
  calibrationRole?: "positive" | "control";
  description: string;
  expectedCandidateChecks?: FixtureCandidateCheck[];
  expectedEligibleFindingKeys: string[];
  fixtureId: string;
  lane:
    | "post_choice_consent_controls"
    | "tracking_after_refusal"
    | "gpc_opt_out_signal_handling"
    | "ccpa_cpra_do_not_sell_or_share_availability"
    | "post_opt_out_tracking_behavior"
    | "notice_at_collection"
    | "targeted_advertising_signals"
    | "policy_runtime_vendor_alignment_review"
    | "reject_decline_option_availability"
    | "cookie_notice_availability"
    | "module_failure_guardrail";
  title: string;
  buildBundle: () => JsonRecord;
  unexpectedEligibleFindingKeys?: string[];
};

type FixtureCandidateCheck = {
  confidenceMax?: number;
  confidenceMin?: number;
  demotionReasonsIncludes?: string[];
  eligibilityStatus?: string;
  findingKey: string;
  matchedCriteriaIncludes?: string[];
  missingCorroboratorsIncludes?: string[];
};

type FixtureIndexEntry = {
  artifactPaths: {
    canonicalEvidenceBundle: string;
    fixtureMetadata: string;
    reviewResult: string;
  };
  eligibleFindingKeys: string[];
  expectedEligibleFindingKeys: string[];
  forbiddenEligibleFindingKeys: string[];
  calibrationRole: "positive" | "control";
  candidateCheckFailures: string[];
  fixtureId: string;
  lane: FixtureDefinition["lane"];
  missingExpectedEligibleFindingKeys: string[];
  status: "pass" | "fail";
  title: string;
  unexpectedEligibleFindingKeys: string[];
};

const DEFAULT_STAGE2_DIR = path.join("artifacts", "gold-corpus", "v2-20260613-stage2");
const DEFAULT_OUT_DIR = path.join("artifacts", "gold-corpus", "v2-20260613-stage3-fixtures");
const GENERATED_AT = new Date().toISOString();
const CONSENT_FLOW_MODULE = "consentFlowRuntimeScanner";
const POLICY_SURFACE_MODULE = "policySurfaceScanner";
const PRE_CONSENT_MODULE = "preConsentRuntimeScanner";

void main();

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }
  if (!existsSync(path.join(args.stage2Dir, "synthetic-fixture-plan.json"))) {
    throw new Error(`Missing Stage 2 fixture plan at ${args.stage2Dir}`);
  }

  await mkdir(args.outDir, { recursive: true });

  const definitions = fixtureDefinitions();
  const entries: FixtureIndexEntry[] = [];
  for (const definition of definitions) {
    const fixtureDir = path.join(args.outDir, definition.fixtureId);
    await mkdir(fixtureDir, { recursive: true });
    const bundle = definition.buildBundle();
    const review = await reviewEvidenceBundle(bundle as any);
    const eligibleFindingKeys = review.findingCandidates
      .filter((candidate) => candidate.eligibility.status === "eligible")
      .map((candidate) => candidate.findingKey)
      .sort();
    const missingExpectedEligibleFindingKeys = definition.expectedEligibleFindingKeys
      .filter((findingKey) => !eligibleFindingKeys.includes(findingKey))
      .sort();
    const unexpectedEligibleFindingKeys = (definition.unexpectedEligibleFindingKeys ?? [])
      .filter((findingKey) => eligibleFindingKeys.includes(findingKey))
      .sort();
    const candidateCheckFailures = candidateCheckFailureDetails(review, definition.expectedCandidateChecks ?? []);
    const status =
      missingExpectedEligibleFindingKeys.length === 0 &&
      unexpectedEligibleFindingKeys.length === 0 &&
      candidateCheckFailures.length === 0
      ? "pass"
      : "fail";

    const bundlePath = path.join(fixtureDir, "CanonicalEvidenceBundle.json");
    const reviewPath = path.join(fixtureDir, "ReviewResult.json");
    const metadataPath = path.join(fixtureDir, "FixtureMetadata.json");
    await writeJson(bundlePath, bundle);
    await writeJson(reviewPath, review);
    await writeJson(metadataPath, {
      fixtureMetadataVersion: "wc01.v2_regulatory_gold_corpus_stage3.fixture_metadata.1",
      generatedAt: GENERATED_AT,
      guardrails: guardrails(),
      calibrationRole: definition.calibrationRole ?? "positive",
      description: definition.description,
      expectedCandidateChecks: definition.expectedCandidateChecks ?? [],
      expectedEligibleFindingKeys: definition.expectedEligibleFindingKeys,
      fixtureId: definition.fixtureId,
      lane: definition.lane,
      title: definition.title,
      unexpectedEligibleFindingKeys: definition.unexpectedEligibleFindingKeys ?? [],
    });

    entries.push({
      artifactPaths: {
        canonicalEvidenceBundle: bundlePath,
        fixtureMetadata: metadataPath,
        reviewResult: reviewPath,
      },
      eligibleFindingKeys,
      expectedEligibleFindingKeys: definition.expectedEligibleFindingKeys,
      forbiddenEligibleFindingKeys: definition.unexpectedEligibleFindingKeys ?? [],
      calibrationRole: definition.calibrationRole ?? "positive",
      candidateCheckFailures,
      fixtureId: definition.fixtureId,
      lane: definition.lane,
      missingExpectedEligibleFindingKeys,
      status,
      title: definition.title,
      unexpectedEligibleFindingKeys,
    });
  }

  const index = {
    fixtureIndexVersion: "wc01.v2_regulatory_gold_corpus_stage3.synthetic_fixture_index.1",
    generatedAt: GENERATED_AT,
    sourceStage2Dir: args.stage2Dir,
    guardrails: guardrails(),
    summary: {
      fixtures: entries.length,
      failed: entries.filter((entry) => entry.status === "fail").length,
      passed: entries.filter((entry) => entry.status === "pass").length,
    },
    entries,
  };
  await writeJson(path.join(args.outDir, "synthetic-fixture-index.json"), index);
  await writeFile(path.join(args.outDir, "README.md"), renderReadme(index));

  console.log(JSON.stringify({
    failed: index.summary.failed,
    fixtures: index.summary.fixtures,
    outDir: args.outDir,
    passed: index.summary.passed,
  }, null, 2));

  if (args.failOnMissing && index.summary.failed > 0) {
    process.exitCode = 1;
  }
}

function fixtureDefinitions(): FixtureDefinition[] {
  return [
    {
      description: "Preference-center reopen/save path with bounded action proof and no raw DOM retention.",
      expectedEligibleFindingKeys: ["post_choice_consent_control_observed"],
      fixtureId: "post-choice-consent-controls",
      lane: "post_choice_consent_controls",
      title: "Post-choice consent controls synthetic fixture",
      buildBundle: postChoiceConsentControlsBundle,
    },
    {
      description: "Reject-flow comparison where advertising vendor, endpoint, and cookie summaries persist after refusal.",
      expectedEligibleFindingKeys: [
        "reject_action_succeeded_or_not_testable",
        "tracking_after_refusal_review_signal",
        "vendors_persist_after_reject_review_signal",
        "cookies_persist_after_reject_review_signal",
      ],
      fixtureId: "tracking-after-refusal",
      lane: "tracking_after_refusal",
      title: "Tracking after refusal synthetic fixture",
      buildBundle: trackingAfterRefusalBundle,
    },
    {
      description: "Second bounded reject-flow comparison with retained action proof and post-refusal runtime deltas.",
      expectedEligibleFindingKeys: [
        "reject_action_succeeded_or_not_testable",
        "tracking_after_refusal_review_signal",
        "vendors_persist_after_reject_review_signal",
        "cookies_persist_after_reject_review_signal",
      ],
      fixtureId: "tracking-after-refusal-second-window",
      lane: "tracking_after_refusal",
      title: "Tracking after refusal second window synthetic fixture",
      buildBundle: trackingAfterRefusalSecondWindowBundle,
    },
    {
      description: "Successful reject-flow comparison with suppressed analytics evidence must not emit post-reject persistence signals.",
      expectedCandidateChecks: [
        {
          eligibilityStatus: "not_eligible",
          findingKey: "tracking_after_refusal_review_signal",
        },
        {
          eligibilityStatus: "not_eligible",
          findingKey: "vendors_persist_after_reject_review_signal",
        },
        {
          eligibilityStatus: "not_eligible",
          findingKey: "cookies_persist_after_reject_review_signal",
        },
        {
          eligibilityStatus: "not_eligible",
          findingKey: "reject_did_not_reduce_tracking_review_signal",
        },
      ],
      expectedEligibleFindingKeys: ["reject_action_succeeded_or_not_testable"],
      fixtureId: "post-reject-tracking-suppressed-control",
      lane: "tracking_after_refusal",
      title: "Post-reject tracking suppressed control fixture",
      calibrationRole: "control",
      buildBundle: postRejectTrackingSuppressedControlBundle,
      unexpectedEligibleFindingKeys: [
        "tracking_after_refusal_review_signal",
        "vendors_persist_after_reject_review_signal",
        "cookies_persist_after_reject_review_signal",
        "reject_did_not_reduce_tracking_review_signal",
      ],
    },
    {
      description: "GPC disclosure plus bounded runtime probe with request header marker and suppression evidence.",
      expectedEligibleFindingKeys: [
        "gpc_disclosure_observed",
        "gpc_runtime_probe_with_disclosure_observed",
      ],
      fixtureId: "gpc-opt-out-signal-handling",
      lane: "gpc_opt_out_signal_handling",
      title: "GPC opt-out signal handling synthetic fixture",
      buildBundle: gpcOptOutSignalHandlingBundle,
    },
    {
      description: "GPC disclosure plus adtech-specific runtime probe with request header, recognition text, and suppression evidence.",
      expectedCandidateChecks: [{
        confidenceMin: 0.86,
        eligibilityStatus: "eligible",
        findingKey: "gpc_runtime_probe_with_disclosure_observed",
        matchedCriteriaIncludes: [
          "bounded_gpc_disclosure_retained",
          "gpc_enabled_runtime_probe_retained",
          "gpc_request_header_marker_retained",
          "gpc_handling_recognition_proof_retained",
        ],
      }],
      expectedEligibleFindingKeys: [
        "gpc_disclosure_observed",
        "gpc_runtime_probe_with_disclosure_observed",
      ],
      fixtureId: "gpc-adtech-suppression-with-disclosure",
      lane: "gpc_opt_out_signal_handling",
      title: "GPC adtech suppression with disclosure synthetic fixture",
      buildBundle: gpcAdtechSuppressionWithDisclosureBundle,
    },
    {
      description: "Bounded GPC disclosure without runtime probe remains policy-disclosure evidence only.",
      expectedEligibleFindingKeys: ["gpc_disclosure_observed"],
      fixtureId: "gpc-policy-disclosure-only",
      lane: "gpc_opt_out_signal_handling",
      title: "GPC policy disclosure only synthetic fixture",
      calibrationRole: "control",
      buildBundle: gpcPolicyDisclosureOnlyBundle,
      unexpectedEligibleFindingKeys: ["gpc_runtime_probe_with_disclosure_observed"],
    },
    {
      description: "GPC runtime probe without retained policy disclosure must not become the combined GPC handling signal.",
      expectedEligibleFindingKeys: [],
      fixtureId: "gpc-runtime-probe-without-disclosure",
      lane: "gpc_opt_out_signal_handling",
      title: "GPC runtime probe without disclosure synthetic fixture",
      calibrationRole: "control",
      buildBundle: gpcRuntimeProbeWithoutDisclosureBundle,
      unexpectedEligibleFindingKeys: [
        "gpc_disclosure_observed",
        "gpc_runtime_probe_with_disclosure_observed",
      ],
    },
    {
      description: "Your Privacy Choices link corroborated by bounded sale/share and targeted advertising opt-out policy context.",
      expectedEligibleFindingKeys: ["do_not_sell_or_share_link_observed"],
      fixtureId: "privacy-choices-sale-share-context",
      lane: "ccpa_cpra_do_not_sell_or_share_availability",
      title: "Privacy choices sale/share context synthetic fixture",
      buildBundle: privacyChoicesSaleShareContextBundle,
    },
    {
      description: "Ambiguous Your Privacy Choices link without retained sale/share context remains lower confidence.",
      expectedCandidateChecks: [{
        confidenceMax: 0.62,
        demotionReasonsIncludes: ["privacy_choices_surface_without_sale_share_context"],
        eligibilityStatus: "eligible",
        findingKey: "do_not_sell_or_share_link_observed",
        matchedCriteriaIncludes: ["privacy_choices_surface_observed_without_sale_share_context"],
        missingCorroboratorsIncludes: ["sale_share_or_opt_out_context"],
      }],
      expectedEligibleFindingKeys: ["do_not_sell_or_share_link_observed"],
      fixtureId: "ambiguous-privacy-choices-no-sale-share-context",
      lane: "ccpa_cpra_do_not_sell_or_share_availability",
      title: "Ambiguous privacy choices control fixture",
      calibrationRole: "control",
      buildBundle: ambiguousPrivacyChoicesNoSaleShareContextBundle,
    },
    {
      description: "Weak non-clickable Cookie Policy link shaped like a reject candidate must not become reject path availability.",
      expectedEligibleFindingKeys: [],
      fixtureId: "weak-reject-policy-link",
      lane: "reject_decline_option_availability",
      title: "Weak reject policy link negative synthetic fixture",
      calibrationRole: "control",
      buildBundle: weakRejectPolicyLinkBundle,
      unexpectedEligibleFindingKeys: ["reject_control_observed_or_not_observed"],
    },
    {
      description: "Preference-center reject path with traversal and save proof supports reject availability without first-layer reject.",
      expectedEligibleFindingKeys: [
        "reject_control_observed_or_not_observed",
        "reject_action_succeeded_or_not_testable",
      ],
      fixtureId: "preference-center-reject-path",
      lane: "reject_decline_option_availability",
      title: "Preference center reject path synthetic fixture",
      buildBundle: preferenceCenterRejectPathBundle,
    },
    {
      description: "Fetched privacy policy excerpt explicitly references a separate Cookies Notice with bounded cookie-use context.",
      expectedEligibleFindingKeys: ["cookie_policy_observed_or_not_observed"],
      fixtureId: "privacy-policy-cookie-notice-reference",
      lane: "cookie_notice_availability",
      title: "Privacy policy cookie notice reference synthetic fixture",
      buildBundle: privacyPolicyCookieNoticeReferenceBundle,
    },
    {
      description: "Cookie settings control without bounded cookie notice or policy content remains lower confidence.",
      expectedCandidateChecks: [{
        confidenceMax: 0.58,
        demotionReasonsIncludes: ["cookie_control_observed_without_cookie_policy"],
        eligibilityStatus: "eligible",
        findingKey: "cookie_policy_observed_or_not_observed",
        matchedCriteriaIncludes: ["cookie_settings_or_preferences_surface_observed"],
        missingCorroboratorsIncludes: ["bounded_cookie_policy_or_cookie_notice"],
      }],
      expectedEligibleFindingKeys: ["cookie_policy_observed_or_not_observed"],
      fixtureId: "cookie-settings-only-no-notice",
      lane: "cookie_notice_availability",
      title: "Cookie settings only control fixture",
      calibrationRole: "control",
      buildBundle: cookieSettingsOnlyNoNoticeBundle,
    },
    {
      description: "Explicit Notice at Collection surface with bounded collection-context excerpt and display-safe policy refs.",
      expectedEligibleFindingKeys: ["notice_at_collection_observed"],
      fixtureId: "explicit-notice-at-collection",
      lane: "notice_at_collection",
      title: "Explicit notice at collection synthetic fixture",
      buildBundle: explicitNoticeAtCollectionBundle,
    },
    {
      description: "Generic privacy-policy mention of notice at collection stays demoted until contextual collection-surface evidence is retained.",
      expectedCandidateChecks: [{
        confidenceMax: 0.62,
        demotionReasonsIncludes: ["generic_policy_text_only_without_contextual_notice_surface"],
        eligibilityStatus: "eligible",
        findingKey: "notice_at_collection_observed",
        matchedCriteriaIncludes: ["generic_policy_notice_at_collection_topic"],
        missingCorroboratorsIncludes: ["contextual_notice_at_collection_surface"],
      }],
      expectedEligibleFindingKeys: ["notice_at_collection_observed"],
      fixtureId: "generic-policy-notice-at-collection",
      lane: "notice_at_collection",
      title: "Generic policy Notice at Collection control fixture",
      calibrationRole: "control",
      buildBundle: genericPolicyNoticeAtCollectionBundle,
    },
    {
      description: "Advertising-purpose runtime journey with direct third-party cookie evidence and bounded vendor attribution.",
      expectedEligibleFindingKeys: ["targeted_advertising_runtime_signal"],
      fixtureId: "targeted-advertising-runtime-signal",
      lane: "targeted_advertising_signals",
      title: "Targeted advertising runtime signal synthetic fixture",
      buildBundle: targetedAdvertisingRuntimeSignalBundle,
    },
    {
      description: "Analytics-only third-party runtime evidence must not become a targeted-advertising signal.",
      expectedCandidateChecks: [{
        eligibilityStatus: "not_eligible",
        findingKey: "targeted_advertising_runtime_signal",
        missingCorroboratorsIncludes: ["advertising_purpose_runtime_evidence"],
      }],
      expectedEligibleFindingKeys: [],
      fixtureId: "analytics-only-no-targeted-advertising",
      lane: "targeted_advertising_signals",
      title: "Analytics-only targeted advertising control fixture",
      calibrationRole: "control",
      buildBundle: analyticsOnlyNoTargetedAdvertisingBundle,
      unexpectedEligibleFindingKeys: ["targeted_advertising_runtime_signal"],
    },
    {
      description: "CCPA opt-out action proof with comparable advertising-purpose before/after runtime evidence.",
      expectedEligibleFindingKeys: ["post_opt_out_targeted_advertising_behavior_signal"],
      fixtureId: "post-opt-out-advertising-comparison",
      lane: "post_opt_out_tracking_behavior",
      title: "Post-opt-out advertising comparison synthetic fixture",
      buildBundle: postOptOutAdvertisingComparisonBundle,
    },
    {
      description: "GPC runtime proof with comparable advertising-purpose suppression evidence after opt-out.",
      expectedCandidateChecks: [{
        confidenceMin: 0.82,
        eligibilityStatus: "eligible",
        findingKey: "post_opt_out_targeted_advertising_behavior_signal",
        matchedCriteriaIncludes: [
          "advertising_purpose_post_opt_out_comparison",
          "advertising_signal_suppressed_after_opt_out",
          "ccpa_opt_out_or_gpc_probe_proof_retained",
        ],
      }],
      expectedEligibleFindingKeys: ["post_opt_out_targeted_advertising_behavior_signal"],
      fixtureId: "post-opt-out-gpc-advertising-suppression",
      lane: "post_opt_out_tracking_behavior",
      title: "Post-opt-out GPC advertising suppression synthetic fixture",
      buildBundle: postOptOutGpcAdvertisingSuppressionBundle,
    },
    {
      description: "Comparable advertising-purpose before/after runtime evidence without retained opt-out/GPC proof must not become a post-opt-out behavior signal.",
      expectedCandidateChecks: [{
        demotionReasonsIncludes: ["ccpa_opt_out_or_gpc_probe_proof_missing"],
        eligibilityStatus: "not_eligible",
        findingKey: "post_opt_out_targeted_advertising_behavior_signal",
        matchedCriteriaIncludes: [
          "advertising_purpose_post_opt_out_comparison",
          "advertising_signal_persisted_after_opt_out",
        ],
        missingCorroboratorsIncludes: ["ccpa_opt_out_or_gpc_probe_proof"],
      }],
      expectedEligibleFindingKeys: [],
      fixtureId: "post-opt-out-advertising-comparison-without-proof",
      lane: "post_opt_out_tracking_behavior",
      title: "Post-opt-out advertising comparison without proof control fixture",
      calibrationRole: "control",
      buildBundle: postOptOutAdvertisingComparisonWithoutProofBundle,
      unexpectedEligibleFindingKeys: ["post_opt_out_targeted_advertising_behavior_signal"],
    },
    {
      description: "Resolved advertising runtime vendor overlaps with bounded policy vendor mention evidence.",
      expectedEligibleFindingKeys: ["policy_runtime_vendor_alignment_review_signal"],
      fixtureId: "policy-runtime-vendor-alignment",
      lane: "policy_runtime_vendor_alignment_review",
      title: "Policy/runtime vendor alignment synthetic fixture",
      buildBundle: policyRuntimeVendorAlignmentBundle,
    },
    {
      description: "Resolved analytics runtime vendor overlaps with bounded policy vendor mention evidence.",
      expectedEligibleFindingKeys: ["policy_runtime_vendor_alignment_review_signal"],
      fixtureId: "policy-runtime-vendor-alignment-analytics",
      lane: "policy_runtime_vendor_alignment_review",
      title: "Policy/runtime vendor analytics alignment synthetic fixture",
      buildBundle: policyRuntimeVendorAlignmentAnalyticsBundle,
    },
    {
      description: "Runtime advertising vendor and bounded policy vendor mention are present but do not overlap; remains review-only.",
      expectedEligibleFindingKeys: ["policy_runtime_vendor_alignment_review_signal"],
      fixtureId: "policy-runtime-vendor-no-overlap",
      lane: "policy_runtime_vendor_alignment_review",
      title: "Policy/runtime vendor no-overlap synthetic fixture",
      calibrationRole: "control",
      buildBundle: policyRuntimeVendorNoOverlapBundle,
    },
    {
      description: "Runtime vendor overlaps policy vendor mention but bounded policy excerpt is missing; remains lower confidence.",
      expectedEligibleFindingKeys: ["policy_runtime_vendor_alignment_review_signal"],
      fixtureId: "policy-runtime-vendor-link-only",
      lane: "policy_runtime_vendor_alignment_review",
      title: "Policy/runtime vendor link-only synthetic fixture",
      calibrationRole: "control",
      buildBundle: policyRuntimeVendorLinkOnlyBundle,
    },
    {
      description: "Failed policy-surface module with no retained policy evidence must not infer CCPA/CPRA opt-out availability.",
      expectedEligibleFindingKeys: [],
      fixtureId: "failed-policy-surface-no-ccpa-opt-out",
      lane: "module_failure_guardrail",
      title: "Failed policy surface no CCPA opt-out synthetic fixture",
      calibrationRole: "control",
      buildBundle: failedPolicySurfaceNoCcpaOptOutBundle,
      unexpectedEligibleFindingKeys: ["do_not_sell_or_share_link_observed"],
    },
    {
      description: "Failed consent-flow module with pre-consent runtime evidence must not infer reject/decline availability.",
      expectedEligibleFindingKeys: [],
      fixtureId: "failed-consent-flow-no-reject-availability",
      lane: "module_failure_guardrail",
      title: "Failed consent flow no reject availability synthetic fixture",
      calibrationRole: "control",
      buildBundle: failedConsentFlowNoRejectAvailabilityBundle,
      unexpectedEligibleFindingKeys: [
        "reject_control_observed_or_not_observed",
        "reject_action_succeeded_or_not_testable",
      ],
    },
  ];
}

function postChoiceConsentControlsBundle(): JsonRecord {
  const attempt = preferenceCenterAttempt("attempt_post_choice_reopen_save", "reopen_preferences", 1_200);
  return withFixtureDefaults(fixtureMinimalBundle({
    scanId: "scan_fixture_post_choice_consent_controls",
    url: "https://fixture.certscore.test/post-choice-consent-controls",
    normalizedUrl: "https://fixture.certscore.test/post-choice-consent-controls",
    scanProfile: fullFixtureProfile(),
    modulesRun: completedModules([PRE_CONSENT_MODULE, CONSENT_FLOW_MODULE]),
    consentUiObservations: [consentBannerObservation()],
    consentActionCandidates: [
      actionCandidate("candidate_manage_preferences", "manage_preferences", "Cookie settings", 0.9),
      actionCandidate("candidate_save_preferences", "save_preferences", "Save choices", 0.88),
    ],
    consentActionAttempts: [attempt],
    consentFlowObservations: [
      {
        observationId: "flow_preference_center_after_choice",
        sourceScanner: "consent_flow_runtime",
        scenario: "preference_center",
        consentStateAtTime: "post_reject",
        bannerLikelyPresent: true,
        actionCandidates: [],
        actionAttempts: [attempt],
        textExcerpt: "Cookie settings reopened. Analytics and advertising toggles are off. Save choices is available.",
        evidenceRefs: [{ refId: "ref_preference_center_after_choice", label: "Preference center reopened" }],
        artifactRefs: [],
        confidence: 0.9,
        directVsInferred: "direct",
      },
    ],
    derivedRuntimeSignals: {
      thirdPartyVendorsObserved: false,
      preConsentTrackingObserved: false,
      thirdPartyCookiesPreConsentObserved: false,
      consentBannerLikelyPresent: true,
      sessionReplayOrBehavioralAnalyticsObserved: false,
      journeySummary: emptyJourneySummary(),
      notes: ["synthetic_fixture"],
    },
  }));
}

function trackingAfterRefusalBundle(): JsonRecord {
  const rejectAttempt = directRejectAttempt();
  const comparison = postRejectPersistenceComparison();
  const analyticsAfterReject = cloneNetworkEvent(fixtureAnalyticsRequestEvent, {
    consentStateAtTime: "post_reject",
    eventId: "net_ga_collect_after_reject",
    requestId: "req_ga_collect_after_reject",
    scenario: "reject_all_flow",
    timestampMs: 2_000,
  });
  const cookieAfterReject = {
    ...fixturePreConsentCookieEvent,
    consentStateAtTime: "post_reject" as const,
    eventId: "cookie_ide_after_reject",
    scenario: "reject_all_flow",
    timestampMs: 2_100,
  };
  return withFixtureDefaults(fixtureMinimalBundle({
    scanId: "scan_fixture_tracking_after_refusal",
    url: "https://fixture.certscore.test/tracking-after-refusal",
    normalizedUrl: "https://fixture.certscore.test/tracking-after-refusal",
    scanProfile: fullFixtureProfile(),
    modulesRun: completedModules([PRE_CONSENT_MODULE, CONSENT_FLOW_MODULE]),
    runtimeTimeline: [fixtureAnalyticsRequestEvent, fixturePreConsentCookieEvent, analyticsAfterReject, cookieAfterReject],
    networkEvents: [fixtureAnalyticsRequestEvent, analyticsAfterReject],
    cookieEvents: [fixturePreConsentCookieEvent, cookieAfterReject],
    consentUiObservations: [consentBannerObservation()],
    consentActionCandidates: [actionCandidate("candidate_reject_all", "reject_all", "Reject all", 0.91)],
    consentActionAttempts: [rejectAttempt],
    consentFlowComparisons: [comparison],
    normalizedVendorObservations: [fixtureGoogleAnalyticsVendor(), fixtureDoubleClickVendor()],
    observedJourneys: [
      withPhaseDelta(fixtureAnalyticsCollectionJourney(), comparison.journeyPhaseDeltas[0]),
      withPhaseDelta(fixturePreConsentCookieJourney(), comparison.journeyPhaseDeltas[1]),
    ],
    derivedRuntimeSignals: {
      thirdPartyVendorsObserved: true,
      preConsentTrackingObserved: true,
      thirdPartyCookiesPreConsentObserved: true,
      consentBannerLikelyPresent: true,
      sessionReplayOrBehavioralAnalyticsObserved: false,
      journeySummary: journeySummary([fixtureAnalyticsCollectionJourney(), fixturePreConsentCookieJourney()]),
      notes: ["synthetic_fixture"],
    },
  }));
}

function trackingAfterRefusalSecondWindowBundle(): JsonRecord {
  const bundle = trackingAfterRefusalBundle();
  return {
    ...bundle,
    scanId: "scan_fixture_tracking_after_refusal_second_window",
    url: "https://fixture.certscore.test/tracking-after-refusal-second-window",
    normalizedUrl: "https://fixture.certscore.test/tracking-after-refusal-second-window",
    consentFlowComparisons: (bundle.consentFlowComparisons ?? []).map((comparison: JsonRecord) => ({
      ...comparison,
      comparisonId: "comparison_post_reject_persistence_second_window",
      evidenceRefs: [{
        refId: "ref_comparison_post_reject_persistence_second_window",
        eventType: "consent_comparison",
        label: "Second post-reject comparison",
      }],
    })),
    derivedRuntimeSignals: {
      ...bundle.derivedRuntimeSignals,
      notes: ["synthetic_fixture", "tracking_after_refusal_second_window"],
    },
  };
}

function postRejectTrackingSuppressedControlBundle(): JsonRecord {
  const rejectAttempt = directRejectAttempt();
  const comparison = postRejectSuppressionComparison();
  const analyticsJourney = fixtureAnalyticsCollectionJourney();
  return withFixtureDefaults(fixtureMinimalBundle({
    scanId: "scan_fixture_post_reject_tracking_suppressed_control",
    url: "https://fixture.certscore.test/post-reject-tracking-suppressed-control",
    normalizedUrl: "https://fixture.certscore.test/post-reject-tracking-suppressed-control",
    scanProfile: fullFixtureProfile(),
    modulesRun: completedModules([PRE_CONSENT_MODULE, CONSENT_FLOW_MODULE]),
    runtimeTimeline: [fixtureAnalyticsRequestEvent],
    networkEvents: [fixtureAnalyticsRequestEvent],
    consentUiObservations: [consentBannerObservation()],
    consentActionCandidates: [actionCandidate("candidate_reject_all", "reject_all", "Reject all", 0.91)],
    consentActionAttempts: [rejectAttempt],
    consentFlowComparisons: [comparison],
    normalizedVendorObservations: [fixtureGoogleAnalyticsVendor()],
    observedJourneys: [withPhaseDelta(analyticsJourney, comparison.journeyPhaseDeltas[0])],
    derivedRuntimeSignals: {
      thirdPartyVendorsObserved: true,
      preConsentTrackingObserved: true,
      thirdPartyCookiesPreConsentObserved: false,
      consentBannerLikelyPresent: true,
      sessionReplayOrBehavioralAnalyticsObserved: false,
      journeySummary: journeySummary([analyticsJourney]),
      notes: ["synthetic_fixture", "post_reject_tracking_suppressed_control"],
    },
  }));
}

function gpcOptOutSignalHandlingBundle(): JsonRecord {
  const gpcNetworkEvent = cloneNetworkEvent(fixtureAnalyticsRequestEvent, {
    consentStateAtTime: "pre_consent",
    eventId: "net_gpc_probe_privacy_signal",
    requestHeaders: {
      cookieHeaderPresent: false,
      cookieNames: [],
      authorizationHeaderPresent: false,
      secGpc: "1",
    },
    requestId: "req_gpc_probe_privacy_signal",
    scenario: "gpc_enabled",
    timestampMs: 1_600,
  });
  const comparison = gpcSuppressionComparison();
  return withFixtureDefaults(fixtureMinimalBundle({
    scanId: "scan_fixture_gpc_opt_out_signal_handling",
    url: "https://fixture.certscore.test/gpc-opt-out-signal-handling",
    normalizedUrl: "https://fixture.certscore.test/gpc-opt-out-signal-handling",
    scanProfile: fullFixtureProfile(),
    modulesRun: completedModules([PRE_CONSENT_MODULE, CONSENT_FLOW_MODULE, POLICY_SURFACE_MODULE]),
    networkEvents: [gpcNetworkEvent],
    runtimeTimeline: [gpcNetworkEvent],
    policySurfaceObservations: [gpcPolicySurface()],
    consentFlowObservations: [
      {
        observationId: "flow_gpc_recognition",
        sourceScanner: "consent_flow_runtime",
        scenario: "gpc_enabled",
        consentStateAtTime: "pre_consent",
        bannerLikelyPresent: false,
        actionCandidates: [],
        actionAttempts: [],
        textExcerpt: "Global Privacy Control detected and applied as an opt-out preference signal.",
        evidenceRefs: [{ refId: "ref_gpc_recognition", label: "GPC recognition text" }],
        artifactRefs: [],
        confidence: 0.9,
        directVsInferred: "direct",
      },
    ],
    consentFlowComparisons: [comparison],
    observedJourneys: [gpcJourney(gpcNetworkEvent)],
    derivedRuntimeSignals: {
      thirdPartyVendorsObserved: true,
      preConsentTrackingObserved: false,
      thirdPartyCookiesPreConsentObserved: false,
      consentBannerLikelyPresent: false,
      sessionReplayOrBehavioralAnalyticsObserved: false,
      journeySummary: journeySummary([gpcJourney(gpcNetworkEvent)]),
      notes: ["synthetic_fixture"],
    },
  }));
}

function gpcAdtechSuppressionWithDisclosureBundle(): JsonRecord {
  const gpcNetworkEvent = gpcAdtechNetworkEvent("net_gpc_probe_doubleclick_suppressed");
  const comparison = gpcAdtechSuppressionComparison();
  return withFixtureDefaults(fixtureMinimalBundle({
    scanId: "scan_fixture_gpc_adtech_suppression_with_disclosure",
    url: "https://fixture.certscore.test/gpc-adtech-suppression-with-disclosure",
    normalizedUrl: "https://fixture.certscore.test/gpc-adtech-suppression-with-disclosure",
    scanProfile: fullFixtureProfile(),
    modulesRun: completedModules([PRE_CONSENT_MODULE, CONSENT_FLOW_MODULE, POLICY_SURFACE_MODULE]),
    networkEvents: [gpcNetworkEvent],
    runtimeTimeline: [gpcNetworkEvent],
    policySurfaceObservations: [gpcPolicySurface()],
    consentFlowObservations: [gpcRecognitionObservation("flow_gpc_adtech_recognition")],
    consentFlowComparisons: [comparison],
    observedJourneys: [gpcJourney(gpcNetworkEvent)],
    normalizedVendorObservations: [fixtureDoubleClickVendor()],
    derivedRuntimeSignals: {
      thirdPartyVendorsObserved: true,
      preConsentTrackingObserved: false,
      thirdPartyCookiesPreConsentObserved: false,
      consentBannerLikelyPresent: false,
      sessionReplayOrBehavioralAnalyticsObserved: false,
      journeySummary: journeySummary([gpcJourney(gpcNetworkEvent)]),
      notes: ["synthetic_fixture", "gpc_adtech_suppression_with_disclosure"],
    },
  }));
}

function gpcPolicyDisclosureOnlyBundle(): JsonRecord {
  return withFixtureDefaults(fixtureMinimalBundle({
    scanId: "scan_fixture_gpc_policy_disclosure_only",
    url: "https://fixture.certscore.test/gpc-policy-disclosure-only",
    normalizedUrl: "https://fixture.certscore.test/gpc-policy-disclosure-only",
    scanProfile: fullFixtureProfile(),
    modulesRun: completedModules([POLICY_SURFACE_MODULE]),
    policySurfaceObservations: [gpcPolicySurface()],
    derivedRuntimeSignals: {
      thirdPartyVendorsObserved: false,
      preConsentTrackingObserved: false,
      thirdPartyCookiesPreConsentObserved: false,
      consentBannerLikelyPresent: false,
      sessionReplayOrBehavioralAnalyticsObserved: false,
      journeySummary: emptyJourneySummary(),
      notes: ["synthetic_fixture", "gpc_policy_disclosure_only"],
    },
  }));
}

function gpcRuntimeProbeWithoutDisclosureBundle(): JsonRecord {
  const gpcNetworkEvent = cloneNetworkEvent(fixtureAnalyticsRequestEvent, {
    consentStateAtTime: "pre_consent",
    eventId: "net_gpc_probe_without_disclosure",
    requestHeaders: {
      cookieHeaderPresent: false,
      cookieNames: [],
      authorizationHeaderPresent: false,
      secGpc: "1",
    },
    requestId: "req_gpc_probe_without_disclosure",
    scenario: "gpc_enabled",
    timestampMs: 1_600,
  });
  return withFixtureDefaults(fixtureMinimalBundle({
    scanId: "scan_fixture_gpc_runtime_probe_without_disclosure",
    url: "https://fixture.certscore.test/gpc-runtime-probe-without-disclosure",
    normalizedUrl: "https://fixture.certscore.test/gpc-runtime-probe-without-disclosure",
    scanProfile: fullFixtureProfile(),
    modulesRun: completedModules([PRE_CONSENT_MODULE, CONSENT_FLOW_MODULE, POLICY_SURFACE_MODULE]),
    networkEvents: [gpcNetworkEvent],
    runtimeTimeline: [gpcNetworkEvent],
    policySurfaceObservations: [],
    consentFlowComparisons: [gpcSuppressionComparison()],
    observedJourneys: [gpcJourney(gpcNetworkEvent)],
    derivedRuntimeSignals: {
      thirdPartyVendorsObserved: true,
      preConsentTrackingObserved: false,
      thirdPartyCookiesPreConsentObserved: false,
      consentBannerLikelyPresent: false,
      sessionReplayOrBehavioralAnalyticsObserved: false,
      journeySummary: journeySummary([gpcJourney(gpcNetworkEvent)]),
      notes: ["synthetic_fixture", "gpc_runtime_probe_without_policy_disclosure"],
    },
  }));
}

function privacyChoicesSaleShareContextBundle(): JsonRecord {
  return withFixtureDefaults(fixtureMinimalBundle({
    scanId: "scan_fixture_privacy_choices_sale_share_context",
    url: "https://fixture.certscore.test/privacy-choices-sale-share-context",
    normalizedUrl: "https://fixture.certscore.test/privacy-choices-sale-share-context",
    scanProfile: fullFixtureProfile(),
    modulesRun: completedModules([POLICY_SURFACE_MODULE]),
    policySurfaceObservations: [
      privacyChoicesLinkSurface(),
      saleSharePolicyContextSurface(),
    ],
    derivedRuntimeSignals: {
      thirdPartyVendorsObserved: false,
      preConsentTrackingObserved: false,
      thirdPartyCookiesPreConsentObserved: false,
      consentBannerLikelyPresent: false,
      sessionReplayOrBehavioralAnalyticsObserved: false,
      journeySummary: emptyJourneySummary(),
      notes: ["synthetic_fixture"],
    },
  }));
}

function ambiguousPrivacyChoicesNoSaleShareContextBundle(): JsonRecord {
  return withFixtureDefaults(fixtureMinimalBundle({
    scanId: "scan_fixture_ambiguous_privacy_choices_no_sale_share_context",
    url: "https://fixture.certscore.test/ambiguous-privacy-choices-no-sale-share-context",
    normalizedUrl: "https://fixture.certscore.test/ambiguous-privacy-choices-no-sale-share-context",
    scanProfile: fullFixtureProfile(),
    modulesRun: completedModules([POLICY_SURFACE_MODULE]),
    policySurfaceObservations: [privacyChoicesLinkSurface()],
    derivedRuntimeSignals: {
      thirdPartyVendorsObserved: false,
      preConsentTrackingObserved: false,
      thirdPartyCookiesPreConsentObserved: false,
      consentBannerLikelyPresent: false,
      sessionReplayOrBehavioralAnalyticsObserved: false,
      journeySummary: emptyJourneySummary(),
      notes: ["synthetic_fixture", "ambiguous_privacy_choices_no_sale_share_context_control"],
    },
  }));
}

function weakRejectPolicyLinkBundle(): JsonRecord {
  return withFixtureDefaults(fixtureMinimalBundle({
    scanId: "scan_fixture_weak_reject_policy_link",
    url: "https://fixture.certscore.test/weak-reject-policy-link",
    normalizedUrl: "https://fixture.certscore.test/weak-reject-policy-link",
    scanProfile: fullFixtureProfile(),
    modulesRun: completedModules([CONSENT_FLOW_MODULE]),
    consentActionCandidates: [
      {
        ...actionCandidate("candidate_weak_cookie_policy", "reject_all", "Cookie Policy", 0.35),
        shouldClick: false,
        contextTextExcerpt: "Terms of Service and Cookie Policy links were visible, but no reject or decline path was proven.",
        evidenceRefs: [{
          refId: "ref_weak_cookie_policy_reject_candidate",
          artifactId: "dom_weak_cookie_policy",
          eventType: "dom_snapshot",
          label: "Cookie Policy",
          excerpt: "Cookie Policy",
        }],
      },
    ],
    consentActionAttempts: [],
    consentFlowComparisons: [],
    consentFlowObservations: [
      {
        observationId: "flow_weak_reject_policy_link",
        sourceScanner: "consent_flow_runtime",
        scenario: "reject_all_flow",
        consentStateAtTime: "pre_consent",
        bannerLikelyPresent: false,
        actionCandidates: [],
        actionAttempts: [],
        textExcerpt: "Terms of Service. Cookie Policy.",
        evidenceRefs: [{ refId: "ref_flow_weak_reject_policy_link", label: "Weak policy-link consent-flow context" }],
        artifactRefs: [],
        confidence: 0.45,
        directVsInferred: "direct",
      },
    ],
    derivedRuntimeSignals: {
      thirdPartyVendorsObserved: false,
      preConsentTrackingObserved: false,
      thirdPartyCookiesPreConsentObserved: false,
      consentBannerLikelyPresent: false,
      sessionReplayOrBehavioralAnalyticsObserved: false,
      journeySummary: emptyJourneySummary(),
      notes: ["synthetic_fixture"],
    },
  }));
}

function preferenceCenterRejectPathBundle(): JsonRecord {
  const rejectAttempt = preferenceCenterAttempt("attempt_preference_center_reject_all", "reject_all", 1_300);
  return withFixtureDefaults(fixtureMinimalBundle({
    scanId: "scan_fixture_preference_center_reject_path",
    url: "https://fixture.certscore.test/preference-center-reject-path",
    normalizedUrl: "https://fixture.certscore.test/preference-center-reject-path",
    scanProfile: fullFixtureProfile(),
    modulesRun: completedModules([CONSENT_FLOW_MODULE]),
    consentUiObservations: [consentBannerObservation()],
    consentActionCandidates: [
      actionCandidate("candidate_manage_preferences", "manage_preferences", "Cookie settings", 0.9),
    ],
    consentActionAttempts: [rejectAttempt],
    consentFlowComparisons: [],
    consentFlowObservations: [
      {
        observationId: "flow_preference_center_reject_path",
        sourceScanner: "consent_flow_runtime",
        scenario: "preference_center",
        consentStateAtTime: "pre_consent",
        bannerLikelyPresent: true,
        actionCandidates: [],
        actionAttempts: [rejectAttempt],
        textExcerpt: "Cookie settings opened. Reject all and save choices controls were visible and completed.",
        evidenceRefs: [{ refId: "ref_preference_center_reject_path", label: "Preference center reject path" }],
        artifactRefs: [],
        confidence: 0.9,
        directVsInferred: "direct",
      },
    ],
    derivedRuntimeSignals: {
      thirdPartyVendorsObserved: false,
      preConsentTrackingObserved: false,
      thirdPartyCookiesPreConsentObserved: false,
      consentBannerLikelyPresent: true,
      sessionReplayOrBehavioralAnalyticsObserved: false,
      journeySummary: emptyJourneySummary(),
      notes: ["synthetic_fixture", "preference_center_reject_path"],
    },
  }));
}

function privacyPolicyCookieNoticeReferenceBundle(): JsonRecord {
  return withFixtureDefaults(fixtureMinimalBundle({
    scanId: "scan_fixture_privacy_policy_cookie_notice_reference",
    url: "https://fixture.certscore.test/privacy-policy-cookie-notice-reference",
    normalizedUrl: "https://fixture.certscore.test/privacy-policy-cookie-notice-reference",
    scanProfile: fullFixtureProfile(),
    modulesRun: completedModules([POLICY_SURFACE_MODULE]),
    policySurfaceObservations: [privacyPolicyCookieNoticeReferenceSurface()],
    derivedRuntimeSignals: {
      thirdPartyVendorsObserved: false,
      preConsentTrackingObserved: false,
      thirdPartyCookiesPreConsentObserved: false,
      consentBannerLikelyPresent: false,
      sessionReplayOrBehavioralAnalyticsObserved: false,
      journeySummary: emptyJourneySummary(),
      notes: ["synthetic_fixture"],
    },
  }));
}

function cookieSettingsOnlyNoNoticeBundle(): JsonRecord {
  return withFixtureDefaults(fixtureMinimalBundle({
    scanId: "scan_fixture_cookie_settings_only_no_notice",
    url: "https://fixture.certscore.test/cookie-settings-only-no-notice",
    normalizedUrl: "https://fixture.certscore.test/cookie-settings-only-no-notice",
    scanProfile: fullFixtureProfile(),
    modulesRun: completedModules([POLICY_SURFACE_MODULE]),
    policySurfaceObservations: [cookieSettingsOnlySurface()],
    derivedRuntimeSignals: {
      thirdPartyVendorsObserved: false,
      preConsentTrackingObserved: false,
      thirdPartyCookiesPreConsentObserved: false,
      consentBannerLikelyPresent: false,
      sessionReplayOrBehavioralAnalyticsObserved: false,
      journeySummary: emptyJourneySummary(),
      notes: ["synthetic_fixture", "cookie_settings_only_no_notice_control"],
    },
  }));
}

function explicitNoticeAtCollectionBundle(): JsonRecord {
  return withFixtureDefaults(fixtureMinimalBundle({
    scanId: "scan_fixture_explicit_notice_at_collection",
    url: "https://fixture.certscore.test/explicit-notice-at-collection",
    normalizedUrl: "https://fixture.certscore.test/explicit-notice-at-collection",
    scanProfile: fullFixtureProfile(),
    modulesRun: completedModules([POLICY_SURFACE_MODULE]),
    policySurfaceObservations: [noticeAtCollectionSurface()],
    derivedRuntimeSignals: {
      thirdPartyVendorsObserved: false,
      preConsentTrackingObserved: false,
      thirdPartyCookiesPreConsentObserved: false,
      consentBannerLikelyPresent: false,
      sessionReplayOrBehavioralAnalyticsObserved: false,
      journeySummary: emptyJourneySummary(),
      notes: ["synthetic_fixture"],
    },
  }));
}

function genericPolicyNoticeAtCollectionBundle(): JsonRecord {
  return withFixtureDefaults(fixtureMinimalBundle({
    scanId: "scan_fixture_generic_policy_notice_at_collection",
    url: "https://fixture.certscore.test/generic-policy-notice-at-collection",
    normalizedUrl: "https://fixture.certscore.test/generic-policy-notice-at-collection",
    scanProfile: fullFixtureProfile(),
    modulesRun: completedModules([POLICY_SURFACE_MODULE]),
    policySurfaceObservations: [genericPolicyNoticeAtCollectionSurface()],
    derivedRuntimeSignals: {
      thirdPartyVendorsObserved: false,
      preConsentTrackingObserved: false,
      thirdPartyCookiesPreConsentObserved: false,
      consentBannerLikelyPresent: false,
      sessionReplayOrBehavioralAnalyticsObserved: false,
      journeySummary: emptyJourneySummary(),
      notes: ["synthetic_fixture", "generic_policy_notice_at_collection_control"],
    },
  }));
}

function targetedAdvertisingRuntimeSignalBundle(): JsonRecord {
  const advertisingCookieJourney = fixturePreConsentCookieJourney();
  return withFixtureDefaults(fixtureMinimalBundle({
    scanId: "scan_fixture_targeted_advertising_runtime_signal",
    url: "https://fixture.certscore.test/targeted-advertising-runtime-signal",
    normalizedUrl: "https://fixture.certscore.test/targeted-advertising-runtime-signal",
    scanProfile: fullFixtureProfile(),
    modulesRun: completedModules([PRE_CONSENT_MODULE]),
    cookieEvents: [fixturePreConsentCookieEvent],
    runtimeTimeline: [fixturePreConsentCookieEvent],
    normalizedVendorObservations: [fixtureDoubleClickVendor()],
    observedJourneys: [advertisingCookieJourney],
    derivedRuntimeSignals: {
      thirdPartyVendorsObserved: true,
      preConsentTrackingObserved: true,
      thirdPartyCookiesPreConsentObserved: true,
      consentBannerLikelyPresent: false,
      sessionReplayOrBehavioralAnalyticsObserved: false,
      journeySummary: journeySummary([advertisingCookieJourney]),
      notes: ["synthetic_fixture"],
    },
  }));
}

function analyticsOnlyNoTargetedAdvertisingBundle(): JsonRecord {
  const analyticsJourney = fixtureAnalyticsCollectionJourney();
  return withFixtureDefaults(fixtureMinimalBundle({
    scanId: "scan_fixture_analytics_only_no_targeted_advertising",
    url: "https://fixture.certscore.test/analytics-only-no-targeted-advertising",
    normalizedUrl: "https://fixture.certscore.test/analytics-only-no-targeted-advertising",
    scanProfile: fullFixtureProfile(),
    modulesRun: completedModules([PRE_CONSENT_MODULE]),
    networkEvents: [fixtureAnalyticsRequestEvent],
    runtimeTimeline: [fixtureAnalyticsRequestEvent],
    normalizedVendorObservations: [fixtureGoogleAnalyticsVendor()],
    observedJourneys: [analyticsJourney],
    derivedRuntimeSignals: {
      thirdPartyVendorsObserved: true,
      preConsentTrackingObserved: true,
      thirdPartyCookiesPreConsentObserved: false,
      consentBannerLikelyPresent: false,
      sessionReplayOrBehavioralAnalyticsObserved: false,
      journeySummary: journeySummary([analyticsJourney]),
      notes: ["synthetic_fixture", "analytics_only_no_targeted_advertising_control"],
    },
  }));
}

function postOptOutAdvertisingComparisonBundle(): JsonRecord {
  const optOutAttempt = doNotSellShareAttempt();
  const comparison = postOptOutAdvertisingComparison();
  const advertisingCookieJourney = fixturePreConsentCookieJourney();
  return withFixtureDefaults(fixtureMinimalBundle({
    scanId: "scan_fixture_post_opt_out_advertising_comparison",
    url: "https://fixture.certscore.test/post-opt-out-advertising-comparison",
    normalizedUrl: "https://fixture.certscore.test/post-opt-out-advertising-comparison",
    scanProfile: fullFixtureProfile(),
    modulesRun: completedModules([PRE_CONSENT_MODULE, CONSENT_FLOW_MODULE]),
    cookieEvents: [fixturePreConsentCookieEvent],
    runtimeTimeline: [fixturePreConsentCookieEvent],
    normalizedVendorObservations: [fixtureDoubleClickVendor()],
    consentActionAttempts: [optOutAttempt],
    consentFlowComparisons: [comparison],
    observedJourneys: [withPhaseDelta(advertisingCookieJourney, comparison.journeyPhaseDeltas[0])],
    derivedRuntimeSignals: {
      thirdPartyVendorsObserved: true,
      preConsentTrackingObserved: true,
      thirdPartyCookiesPreConsentObserved: true,
      consentBannerLikelyPresent: false,
      sessionReplayOrBehavioralAnalyticsObserved: false,
      journeySummary: journeySummary([advertisingCookieJourney]),
      notes: ["synthetic_fixture", "post_opt_out_advertising_comparison"],
    },
  }));
}

function postOptOutGpcAdvertisingSuppressionBundle(): JsonRecord {
  const gpcNetworkEvent = gpcAdtechNetworkEvent("net_post_opt_out_gpc_probe_doubleclick_suppressed");
  const comparison = postOptOutGpcAdvertisingSuppressionComparison();
  const advertisingCookieJourney = fixturePreConsentCookieJourney();
  return withFixtureDefaults(fixtureMinimalBundle({
    scanId: "scan_fixture_post_opt_out_gpc_advertising_suppression",
    url: "https://fixture.certscore.test/post-opt-out-gpc-advertising-suppression",
    normalizedUrl: "https://fixture.certscore.test/post-opt-out-gpc-advertising-suppression",
    scanProfile: fullFixtureProfile(),
    modulesRun: completedModules([PRE_CONSENT_MODULE, CONSENT_FLOW_MODULE]),
    networkEvents: [gpcNetworkEvent],
    cookieEvents: [fixturePreConsentCookieEvent],
    runtimeTimeline: [fixturePreConsentCookieEvent, gpcNetworkEvent],
    normalizedVendorObservations: [fixtureDoubleClickVendor()],
    consentFlowObservations: [gpcRecognitionObservation("flow_post_opt_out_gpc_adtech_recognition")],
    consentFlowComparisons: [comparison],
    observedJourneys: [
      withPhaseDelta(advertisingCookieJourney, comparison.journeyPhaseDeltas[0]),
      gpcJourney(gpcNetworkEvent),
    ],
    derivedRuntimeSignals: {
      thirdPartyVendorsObserved: true,
      preConsentTrackingObserved: true,
      thirdPartyCookiesPreConsentObserved: true,
      consentBannerLikelyPresent: false,
      sessionReplayOrBehavioralAnalyticsObserved: false,
      journeySummary: journeySummary([advertisingCookieJourney, gpcJourney(gpcNetworkEvent)]),
      notes: ["synthetic_fixture", "post_opt_out_gpc_advertising_suppression"],
    },
  }));
}

function postOptOutAdvertisingComparisonWithoutProofBundle(): JsonRecord {
  const comparison = postOptOutAdvertisingComparison();
  const advertisingCookieJourney = fixturePreConsentCookieJourney();
  return withFixtureDefaults(fixtureMinimalBundle({
    scanId: "scan_fixture_post_opt_out_advertising_comparison_without_proof",
    url: "https://fixture.certscore.test/post-opt-out-advertising-comparison-without-proof",
    normalizedUrl: "https://fixture.certscore.test/post-opt-out-advertising-comparison-without-proof",
    scanProfile: fullFixtureProfile(),
    modulesRun: completedModules([PRE_CONSENT_MODULE, CONSENT_FLOW_MODULE]),
    cookieEvents: [fixturePreConsentCookieEvent],
    runtimeTimeline: [fixturePreConsentCookieEvent],
    normalizedVendorObservations: [fixtureDoubleClickVendor()],
    consentActionAttempts: [],
    consentFlowComparisons: [comparison],
    observedJourneys: [withPhaseDelta(advertisingCookieJourney, comparison.journeyPhaseDeltas[0])],
    derivedRuntimeSignals: {
      thirdPartyVendorsObserved: true,
      preConsentTrackingObserved: true,
      thirdPartyCookiesPreConsentObserved: true,
      consentBannerLikelyPresent: false,
      sessionReplayOrBehavioralAnalyticsObserved: false,
      journeySummary: journeySummary([advertisingCookieJourney]),
      notes: ["synthetic_fixture", "post_opt_out_advertising_without_opt_out_proof_control"],
    },
  }));
}

function policyRuntimeVendorAlignmentBundle(): JsonRecord {
  const advertisingCookieJourney = fixturePreConsentCookieJourney();
  return withFixtureDefaults(fixtureMinimalBundle({
    scanId: "scan_fixture_policy_runtime_vendor_alignment",
    url: "https://fixture.certscore.test/policy-runtime-vendor-alignment",
    normalizedUrl: "https://fixture.certscore.test/policy-runtime-vendor-alignment",
    scanProfile: fullFixtureProfile(),
    modulesRun: completedModules([PRE_CONSENT_MODULE, POLICY_SURFACE_MODULE]),
    cookieEvents: [fixturePreConsentCookieEvent],
    runtimeTimeline: [fixturePreConsentCookieEvent],
    normalizedVendorObservations: [fixtureDoubleClickVendor()],
    observedJourneys: [advertisingCookieJourney],
    policySurfaceObservations: [policyVendorAlignmentSurface()],
    derivedRuntimeSignals: {
      thirdPartyVendorsObserved: true,
      preConsentTrackingObserved: true,
      thirdPartyCookiesPreConsentObserved: true,
      consentBannerLikelyPresent: false,
      sessionReplayOrBehavioralAnalyticsObserved: false,
      journeySummary: journeySummary([advertisingCookieJourney]),
      notes: ["synthetic_fixture"],
    },
  }));
}

function policyRuntimeVendorAlignmentAnalyticsBundle(): JsonRecord {
  const analyticsJourney = fixtureAnalyticsCollectionJourney();
  return withFixtureDefaults(fixtureMinimalBundle({
    scanId: "scan_fixture_policy_runtime_vendor_alignment_analytics",
    url: "https://fixture.certscore.test/policy-runtime-vendor-alignment-analytics",
    normalizedUrl: "https://fixture.certscore.test/policy-runtime-vendor-alignment-analytics",
    scanProfile: fullFixtureProfile(),
    modulesRun: completedModules([PRE_CONSENT_MODULE, POLICY_SURFACE_MODULE]),
    networkEvents: [fixtureAnalyticsRequestEvent],
    runtimeTimeline: [fixtureAnalyticsRequestEvent],
    normalizedVendorObservations: [fixtureGoogleAnalyticsVendor()],
    observedJourneys: [analyticsJourney],
    policySurfaceObservations: [policyVendorAnalyticsAlignmentSurface()],
    derivedRuntimeSignals: {
      thirdPartyVendorsObserved: true,
      preConsentTrackingObserved: true,
      thirdPartyCookiesPreConsentObserved: false,
      consentBannerLikelyPresent: false,
      sessionReplayOrBehavioralAnalyticsObserved: false,
      journeySummary: journeySummary([analyticsJourney]),
      notes: ["synthetic_fixture", "policy_runtime_vendor_alignment_analytics"],
    },
  }));
}

function policyRuntimeVendorNoOverlapBundle(): JsonRecord {
  const advertisingCookieJourney = fixturePreConsentCookieJourney();
  return withFixtureDefaults(fixtureMinimalBundle({
    scanId: "scan_fixture_policy_runtime_vendor_no_overlap",
    url: "https://fixture.certscore.test/policy-runtime-vendor-no-overlap",
    normalizedUrl: "https://fixture.certscore.test/policy-runtime-vendor-no-overlap",
    scanProfile: fullFixtureProfile(),
    modulesRun: completedModules([PRE_CONSENT_MODULE, POLICY_SURFACE_MODULE]),
    cookieEvents: [fixturePreConsentCookieEvent],
    runtimeTimeline: [fixturePreConsentCookieEvent],
    normalizedVendorObservations: [fixtureDoubleClickVendor()],
    observedJourneys: [advertisingCookieJourney],
    policySurfaceObservations: [policyVendorNoOverlapSurface()],
    derivedRuntimeSignals: {
      thirdPartyVendorsObserved: true,
      preConsentTrackingObserved: true,
      thirdPartyCookiesPreConsentObserved: true,
      consentBannerLikelyPresent: false,
      sessionReplayOrBehavioralAnalyticsObserved: false,
      journeySummary: journeySummary([advertisingCookieJourney]),
      notes: ["synthetic_fixture", "policy_runtime_vendor_no_overlap"],
    },
  }));
}

function policyRuntimeVendorLinkOnlyBundle(): JsonRecord {
  const advertisingCookieJourney = fixturePreConsentCookieJourney();
  return withFixtureDefaults(fixtureMinimalBundle({
    scanId: "scan_fixture_policy_runtime_vendor_link_only",
    url: "https://fixture.certscore.test/policy-runtime-vendor-link-only",
    normalizedUrl: "https://fixture.certscore.test/policy-runtime-vendor-link-only",
    scanProfile: fullFixtureProfile(),
    modulesRun: completedModules([PRE_CONSENT_MODULE, POLICY_SURFACE_MODULE]),
    cookieEvents: [fixturePreConsentCookieEvent],
    runtimeTimeline: [fixturePreConsentCookieEvent],
    normalizedVendorObservations: [fixtureDoubleClickVendor()],
    observedJourneys: [advertisingCookieJourney],
    policySurfaceObservations: [policyVendorLinkOnlySurface()],
    derivedRuntimeSignals: {
      thirdPartyVendorsObserved: true,
      preConsentTrackingObserved: true,
      thirdPartyCookiesPreConsentObserved: true,
      consentBannerLikelyPresent: false,
      sessionReplayOrBehavioralAnalyticsObserved: false,
      journeySummary: journeySummary([advertisingCookieJourney]),
      notes: ["synthetic_fixture", "policy_runtime_vendor_link_only"],
    },
  }));
}

function failedPolicySurfaceNoCcpaOptOutBundle(): JsonRecord {
  return withFixtureDefaults(fixtureMinimalBundle({
    scanId: "scan_fixture_failed_policy_surface_no_ccpa_opt_out",
    url: "https://fixture.certscore.test/failed-policy-surface-no-ccpa-opt-out",
    normalizedUrl: "https://fixture.certscore.test/failed-policy-surface-no-ccpa-opt-out",
    scanProfile: fullFixtureProfile(),
    modulesRun: [failedModule(POLICY_SURFACE_MODULE, "fixture_policy_surface_failed")],
    policySurfaceObservations: [],
    derivedRuntimeSignals: {
      thirdPartyVendorsObserved: false,
      preConsentTrackingObserved: false,
      thirdPartyCookiesPreConsentObserved: false,
      consentBannerLikelyPresent: false,
      sessionReplayOrBehavioralAnalyticsObserved: false,
      journeySummary: emptyJourneySummary(),
      notes: ["synthetic_fixture", "policy_surface_failed_no_policy_evidence"],
    },
  }));
}

function failedConsentFlowNoRejectAvailabilityBundle(): JsonRecord {
  return withFixtureDefaults(fixtureMinimalBundle({
    scanId: "scan_fixture_failed_consent_flow_no_reject_availability",
    url: "https://fixture.certscore.test/failed-consent-flow-no-reject-availability",
    normalizedUrl: "https://fixture.certscore.test/failed-consent-flow-no-reject-availability",
    scanProfile: fullFixtureProfile(),
    modulesRun: [
      ...completedModules([PRE_CONSENT_MODULE]),
      failedModule(CONSENT_FLOW_MODULE, "fixture_consent_flow_failed"),
    ],
    networkEvents: [fixtureAnalyticsRequestEvent],
    runtimeTimeline: [fixtureAnalyticsRequestEvent],
    consentUiObservations: [consentBannerObservation()],
    consentActionCandidates: [],
    consentActionAttempts: [],
    consentFlowComparisons: [],
    observedJourneys: [fixtureAnalyticsCollectionJourney()],
    normalizedVendorObservations: [fixtureGoogleAnalyticsVendor()],
    derivedRuntimeSignals: {
      thirdPartyVendorsObserved: true,
      preConsentTrackingObserved: true,
      thirdPartyCookiesPreConsentObserved: false,
      consentBannerLikelyPresent: true,
      sessionReplayOrBehavioralAnalyticsObserved: false,
      journeySummary: journeySummary([fixtureAnalyticsCollectionJourney()]),
      notes: ["synthetic_fixture", "consent_flow_failed_no_reject_proof"],
    },
  }));
}

function withFixtureDefaults(bundle: JsonRecord): JsonRecord {
  const networkEvents = bundle.networkEvents ?? [];
  const thirdPartyRequests = networkEvents.filter((event) => event.thirdParty || event.isThirdParty).length;
  const cookiesBeforeConsent = bundle.cookieEvents.filter((event) => event.consentStateAtTime === "pre_consent").length;
  return {
    ...bundle,
    scannerVersion: "certscore-v2-synthetic-fixture",
    schemaVersion: SCHEMA_VERSION,
    runtimeCoverage: {
      coverageStatus: "usable",
      limitationKeys: [],
      fallbackModesUsed: [],
      observationCounts: {
        cookieEvents: bundle.cookieEvents.length,
        cookiesBeforeConsent,
        networkEvents: networkEvents.length,
        normalizedVendors: bundle.normalizedVendorObservations.length,
        observedJourneys: bundle.observedJourneys.length,
        thirdPartyRequests,
      },
      silentEmpty: false,
      notes: ["synthetic_fixture_display_safe"],
    },
  };
}

function fullFixtureProfile(): JsonRecord {
  return {
    profileId: "full",
    label: "Synthetic full v2 diagnostic fixture",
    targetDurationMs: 1_000,
    internalBudgetMs: 1_000,
    enabledModules: [PRE_CONSENT_MODULE, CONSENT_FLOW_MODULE, POLICY_SURFACE_MODULE],
  };
}

function completedModules(moduleNames: string[]): JsonRecord[] {
  return moduleNames.map((moduleName, index) => ({
    moduleName,
    status: "completed",
    startedAt: "2026-01-01T00:00:00.000Z",
    completedAt: "2026-01-01T00:00:01.000Z",
    durationMs: 100 + index,
    evidenceRefs: [],
    errors: [],
  }));
}

function failedModule(moduleName: string, errorCode: string): JsonRecord {
  return {
    moduleName,
    status: "failed",
    startedAt: "2026-01-01T00:00:00.000Z",
    completedAt: "2026-01-01T00:00:01.000Z",
    durationMs: 100,
    evidenceRefs: [],
    errors: [`${errorCode}: Synthetic module failure for internal guardrail fixture.`],
  };
}

function consentBannerObservation(): JsonRecord {
  return {
    observationId: "consent_banner_fixture",
    observedAtMs: 500,
    likelyPresent: true,
    basis: ["manual_fixture", "button_accept_detected", "button_reject_detected"],
    textExcerpt: "We use cookies for analytics and advertising. Accept all. Reject all. Cookie settings.",
    evidenceRefs: [{ refId: "ref_consent_banner_fixture", eventType: "consent_ui", label: "Fixture consent banner" }],
    confidence: 0.9,
  };
}

function actionCandidate(
  actionId: string,
  actionType: string,
  labelText: string,
  confidence: number,
): JsonRecord {
  return {
    actionId,
    actionType,
    labelText,
    normalizedLabel: labelText.toLowerCase(),
    selectorSummary: "button",
    contextTextExcerpt: "Synthetic bounded consent control fixture.",
    visible: true,
    enabled: true,
    confidence,
    detectionMethod: "manual_fixture",
    shouldClick: true,
    evidenceRefs: [{ refId: `ref_${actionId}`, eventType: "consent_ui", label: labelText }],
    screenshotArtifactRefs: [],
    assistMetadata: [],
  };
}

function preferenceCenterAttempt(
  attemptId: string,
  actionType: string,
  timestampMs: number,
): JsonRecord {
  return {
    attemptId,
    actionType,
    attempted: true,
    succeeded: true,
    actionProof: {
      proofVersion: "consent_action_proof.v1",
      candidateObserved: true,
      candidateActionId: "candidate_manage_preferences",
      candidateLabelText: "Cookie settings",
      candidateNormalizedActionType: actionType,
      candidateSelectorSummary: "button",
      candidateConfidence: 0.9,
      candidateDetectionMethod: "manual_fixture",
      actionPath: "preference_center_toggle_save",
      attemptedStatus: "attempted_succeeded",
      actionTimestampMs: timestampMs,
      postClickSettleMs: 500,
      beforeDomExcerpt: "Cookie settings closed.",
      afterDomExcerpt: "Cookie settings reopened. Save choices available.",
      preActionConsentStateMarkers: ["preferences previously saved"],
      postActionConsentStateMarkers: ["preference center visible", "save choices available"],
      evidenceRefs: [{ refId: `ref_${attemptId}_proof`, label: "Preference center action proof" }],
    },
    viaPreferenceCenter: true,
    preferenceCenterTraversal: {
      traversalId: `traversal_${attemptId}`,
      firstLayerActionId: "candidate_manage_preferences",
      opened: true,
      openSucceeded: true,
      secondLayerObserved: true,
      secondLayerControlCount: 4,
      rejectAllControlObserved: true,
      saveChoicesControlObserved: true,
      acceptAllControlObserved: true,
      categoryTogglesObserved: 2,
      attemptedDisableCategoryToggles: true,
      disabledCategoryToggles: 2,
      attemptedRejectViaPreferenceCenter: true,
      attemptedSaveChoices: true,
      succeeded: true,
      confidence: 0.9,
      evidenceRefs: [{ refId: `ref_${attemptId}_preference_center`, label: "Preference center traversal" }],
      screenshotArtifactRefs: [],
      domArtifactRefs: [],
    },
    bannerPresentBefore: true,
    bannerPresentAfter: false,
    timestampMs,
    scenario: "preference_center",
    evidenceRefs: [{ refId: `ref_${attemptId}`, label: "Preference center save attempt" }],
  };
}

function directRejectAttempt(): JsonRecord {
  return {
    attemptId: "attempt_reject_all",
    actionType: "reject_all",
    attempted: true,
    succeeded: true,
    actionProof: {
      proofVersion: "consent_action_proof.v1",
      candidateObserved: true,
      candidateActionId: "candidate_reject_all",
      candidateLabelText: "Reject all",
      candidateNormalizedActionType: "reject_all",
      candidateSelectorSummary: "button",
      candidateConfidence: 0.91,
      candidateDetectionMethod: "manual_fixture",
      actionPath: "direct_action",
      attemptedStatus: "attempted_succeeded",
      actionTimestampMs: 1_200,
      postClickSettleMs: 500,
      beforeDomExcerpt: "Reject all button visible.",
      afterDomExcerpt: "Choices saved.",
      preActionConsentStateMarkers: ["banner visible"],
      postActionConsentStateMarkers: ["choices saved"],
      evidenceRefs: [{ refId: "ref_reject_all_proof", label: "Reject all action proof" }],
    },
    viaPreferenceCenter: false,
    bannerPresentBefore: true,
    bannerPresentAfter: false,
    timestampMs: 1_200,
    scenario: "reject_all_flow",
    evidenceRefs: [{ refId: "ref_attempt_reject_all", label: "Reject all attempt" }],
  };
}

function doNotSellShareAttempt(): JsonRecord {
  return {
    attemptId: "attempt_do_not_sell_share",
    actionType: "do_not_sell_share",
    attempted: true,
    succeeded: true,
    actionProof: {
      proofVersion: "consent_action_proof.v1",
      candidateObserved: true,
      candidateActionId: "candidate_do_not_sell_share",
      candidateLabelText: "Do Not Sell or Share",
      candidateNormalizedActionType: "do_not_sell_share",
      candidateSelectorSummary: "button",
      candidateConfidence: 0.91,
      candidateDetectionMethod: "manual_fixture",
      actionPath: "privacy_opt_out_form",
      attemptedStatus: "attempted_succeeded",
      actionTimestampMs: 1_200,
      postClickSettleMs: 500,
      beforeDomExcerpt: "Do Not Sell or Share control visible.",
      afterDomExcerpt: "Your opt-out choices were saved.",
      preActionConsentStateMarkers: ["privacy choices visible"],
      postActionConsentStateMarkers: ["opt-out saved"],
      evidenceRefs: [{ refId: "ref_do_not_sell_share_proof", label: "Do Not Sell/Share action proof" }],
    },
    viaPreferenceCenter: false,
    bannerPresentBefore: true,
    bannerPresentAfter: false,
    timestampMs: 1_200,
    scenario: "privacy_opt_out_flow",
    evidenceRefs: [{ refId: "ref_attempt_do_not_sell_share", label: "Do Not Sell/Share attempt" }],
  };
}

function postRejectPersistenceComparison(): JsonRecord {
  return {
    comparisonId: "comparison_post_reject_persistence",
    comparedScenarios: "fresh_pre_consent_vs_after_reject",
    vendorsPersistingAfterReject: ["Google"],
    vendorsSuppressedAfterReject: [],
    vendorsAppearingOnlyAfterAccept: [],
    cookiesPersistingAfterReject: ["IDE"],
    cookiesSetAfterAccept: [],
    collectionEndpointsPersistingAfterReject: ["www.google-analytics.com/g/collect"],
    collectionEndpointsSuppressedAfterReject: [],
    collectionEndpointsAppearingOnlyAfterAccept: [],
    requestCountDeltaByVendor: { Google: 0 },
    cookieCountDeltaByVendor: { Google: 0 },
    journeyPhaseDeltas: [
      {
        journeyKey: "tracker:google_analytics",
        displayName: "Google Analytics",
        vendor: "Google",
        endpointHostname: "www.google-analytics.com",
        observedPreConsent: true,
        observedAfterReject: true,
        persistedAfterReject: true,
        evidenceRefs: [{ refId: "ref_post_reject_ga_persisted", label: "GA persisted after reject" }],
      },
      {
        journeyKey: "cookie:ide",
        displayName: "IDE",
        vendor: "Google",
        cookieName: "IDE",
        observedPreConsent: true,
        observedAfterReject: true,
        persistedAfterReject: true,
        evidenceRefs: [{ refId: "ref_post_reject_cookie_persisted", label: "Cookie persisted after reject" }],
      },
    ],
    comparableMeasurement: {
      comparable: true,
      preActionWindow: {
        scenario: "baseline_pre_consent",
        consentStateAtEnd: "pre_consent",
        startedAtMs: 0,
        completedAtMs: 1_000,
        networkEventCount: 1,
        cookieEventCount: 1,
      },
      postActionWindow: {
        scenario: "reject_all_flow",
        consentStateAtEnd: "post_reject",
        startedAtMs: 1_700,
        completedAtMs: 2_700,
        networkEventCount: 1,
        cookieEventCount: 1,
      },
      rejectActionEvent: {
        attemptId: "attempt_reject_all",
        attempted: true,
        succeeded: true,
        actionTimestampMs: 1_200,
        postClickSettleMs: 500,
        proofAvailable: true,
      },
    },
    confidence: 0.9,
    coverageLimitations: [],
    evidenceRefs: [
      { refId: "ref_comparison_post_reject_persistence", eventType: "consent_comparison", label: "Post-reject comparison" },
    ],
  };
}

function postRejectSuppressionComparison(): JsonRecord {
  return {
    comparisonId: "comparison_post_reject_suppression",
    comparedScenarios: "fresh_pre_consent_vs_after_reject",
    vendorsPersistingAfterReject: [],
    vendorsSuppressedAfterReject: ["Google"],
    vendorsAppearingOnlyAfterAccept: [],
    cookiesPersistingAfterReject: [],
    cookiesSetAfterAccept: [],
    collectionEndpointsPersistingAfterReject: [],
    collectionEndpointsSuppressedAfterReject: ["www.google-analytics.com/g/collect"],
    collectionEndpointsAppearingOnlyAfterAccept: [],
    requestCountDeltaByVendor: { Google: -1 },
    cookieCountDeltaByVendor: {},
    journeyPhaseDeltas: [
      {
        journeyKey: "tracker:google_analytics",
        displayName: "Google Analytics",
        vendor: "Google",
        endpointHostname: "www.google-analytics.com",
        observedPreConsent: true,
        observedAfterReject: false,
        suppressedAfterReject: true,
        evidenceRefs: [{ refId: "ref_post_reject_ga_suppressed", label: "GA suppressed after reject" }],
      },
    ],
    comparableMeasurement: {
      comparable: true,
      preActionWindow: {
        scenario: "baseline_pre_consent",
        consentStateAtEnd: "pre_consent",
        startedAtMs: 0,
        completedAtMs: 1_000,
        networkEventCount: 1,
        cookieEventCount: 0,
      },
      postActionWindow: {
        scenario: "reject_all_flow",
        consentStateAtEnd: "post_reject",
        startedAtMs: 1_700,
        completedAtMs: 2_700,
        networkEventCount: 0,
        cookieEventCount: 0,
      },
      rejectActionEvent: {
        attemptId: "attempt_reject_all",
        attempted: true,
        succeeded: true,
        actionTimestampMs: 1_200,
        postClickSettleMs: 500,
        proofAvailable: true,
      },
    },
    confidence: 0.9,
    coverageLimitations: [],
    evidenceRefs: [
      { refId: "ref_comparison_post_reject_suppression", eventType: "consent_comparison", label: "Post-reject suppression comparison" },
    ],
  };
}

function postOptOutAdvertisingComparison(): JsonRecord {
  return {
    comparisonId: "comparison_post_opt_out_advertising_persistence",
    comparedScenarios: "fresh_pre_consent_vs_after_reject",
    vendorsPersistingAfterReject: ["Google Ads / DoubleClick"],
    vendorsSuppressedAfterReject: [],
    vendorsAppearingOnlyAfterAccept: [],
    cookiesPersistingAfterReject: ["IDE"],
    cookiesSetAfterAccept: [],
    collectionEndpointsPersistingAfterReject: ["googleads.g.doubleclick.net"],
    collectionEndpointsSuppressedAfterReject: [],
    collectionEndpointsAppearingOnlyAfterAccept: [],
    requestCountDeltaByVendor: { "Google Ads / DoubleClick": 0 },
    cookieCountDeltaByVendor: { "Google Ads / DoubleClick": 0 },
    journeyPhaseDeltas: [
      {
        journeyKey: "cookie:ide",
        displayName: "IDE",
        vendor: "Google",
        product: "Google Ads / DoubleClick",
        cookieName: "IDE",
        observedPreConsent: true,
        observedAfterReject: true,
        persistedAfterReject: true,
        evidenceRefs: [{ refId: "ref_post_opt_out_ad_cookie_persisted", label: "Advertising cookie persisted after opt-out" }],
      },
    ],
    comparableMeasurement: {
      comparable: true,
      preActionWindow: {
        scenario: "baseline_pre_consent",
        consentStateAtEnd: "pre_consent",
        startedAtMs: 0,
        completedAtMs: 1_000,
        networkEventCount: 1,
        cookieEventCount: 1,
      },
      postActionWindow: {
        scenario: "privacy_opt_out_flow",
        consentStateAtEnd: "post_reject",
        startedAtMs: 1_700,
        completedAtMs: 2_700,
        networkEventCount: 1,
        cookieEventCount: 1,
      },
      rejectActionEvent: {
        attemptId: "attempt_do_not_sell_share",
        attempted: true,
        succeeded: true,
        actionTimestampMs: 1_200,
        postClickSettleMs: 500,
        proofAvailable: true,
      },
    },
    confidence: 0.9,
    coverageLimitations: [],
    evidenceRefs: [
      { refId: "ref_comparison_post_opt_out_advertising", eventType: "consent_comparison", label: "Post-opt-out advertising comparison" },
    ],
  };
}

function gpcSuppressionComparison(): JsonRecord {
  return {
    comparisonId: "comparison_gpc_suppression",
    comparedScenarios: "fresh_pre_consent_vs_gpc_enabled",
    vendorsPersistingAfterReject: [],
    vendorsSuppressedAfterReject: [],
    vendorsAppearingOnlyAfterAccept: [],
    vendorsPersistingAfterGpc: [],
    vendorsSuppressedAfterGpc: ["Google"],
    cookiesPersistingAfterReject: [],
    cookiesSetAfterAccept: [],
    cookiesPersistingAfterGpc: [],
    cookiesSuppressedAfterGpc: ["IDE"],
    collectionEndpointsPersistingAfterReject: [],
    collectionEndpointsSuppressedAfterReject: [],
    collectionEndpointsPersistingAfterGpc: [],
    collectionEndpointsSuppressedAfterGpc: ["www.google-analytics.com/g/collect"],
    collectionEndpointsAppearingOnlyAfterAccept: [],
    requestCountDeltaByVendor: { Google: -1 },
    cookieCountDeltaByVendor: { Google: -1 },
    journeyPhaseDeltas: [
      {
        journeyKey: "tracker:google_analytics",
        displayName: "Google Analytics",
        vendor: "Google",
        endpointHostname: "www.google-analytics.com",
        observedPreConsent: true,
        observedAfterReject: false,
        suppressedAfterReject: true,
        evidenceRefs: [{ refId: "ref_gpc_ga_suppressed", label: "GA suppressed under GPC" }],
      },
    ],
    comparableMeasurement: {
      comparable: true,
      preActionWindow: {
        scenario: "baseline_pre_consent",
        consentStateAtEnd: "pre_consent",
        startedAtMs: 0,
        completedAtMs: 1_000,
        networkEventCount: 1,
        cookieEventCount: 1,
      },
      postActionWindow: {
        scenario: "gpc_enabled",
        consentStateAtEnd: "pre_consent",
        startedAtMs: 1_000,
        completedAtMs: 2_000,
        networkEventCount: 1,
        cookieEventCount: 0,
      },
    },
    confidence: 0.88,
    coverageLimitations: [],
    evidenceRefs: [{ refId: "ref_comparison_gpc_suppression", eventType: "consent_comparison", label: "GPC suppression comparison" }],
  };
}

function gpcAdtechSuppressionComparison(): JsonRecord {
  return {
    comparisonId: "comparison_gpc_adtech_suppression",
    comparedScenarios: "fresh_pre_consent_vs_gpc_enabled",
    vendorsPersistingAfterReject: [],
    vendorsSuppressedAfterReject: [],
    vendorsAppearingOnlyAfterAccept: [],
    vendorsPersistingAfterGpc: [],
    vendorsSuppressedAfterGpc: ["Google Ads / DoubleClick"],
    cookiesPersistingAfterReject: [],
    cookiesSetAfterAccept: [],
    cookiesPersistingAfterGpc: [],
    cookiesSuppressedAfterGpc: ["IDE"],
    collectionEndpointsPersistingAfterReject: [],
    collectionEndpointsSuppressedAfterReject: [],
    collectionEndpointsPersistingAfterGpc: [],
    collectionEndpointsSuppressedAfterGpc: ["googleads.g.doubleclick.net/pagead/id"],
    collectionEndpointsAppearingOnlyAfterAccept: [],
    requestCountDeltaByVendor: { "Google Ads / DoubleClick": -1 },
    cookieCountDeltaByVendor: { "Google Ads / DoubleClick": -1 },
    journeyPhaseDeltas: [
      {
        journeyKey: "cookie:ide",
        displayName: "IDE",
        vendor: "Google",
        product: "Google Ads / DoubleClick",
        cookieName: "IDE",
        observedPreConsent: true,
        observedAfterReject: false,
        suppressedAfterReject: true,
        evidenceRefs: [{ refId: "ref_gpc_ad_cookie_suppressed", label: "Advertising cookie suppressed under GPC" }],
      },
    ],
    comparableMeasurement: {
      comparable: true,
      preActionWindow: {
        scenario: "baseline_pre_consent",
        consentStateAtEnd: "pre_consent",
        startedAtMs: 0,
        completedAtMs: 1_000,
        networkEventCount: 1,
        cookieEventCount: 1,
      },
      postActionWindow: {
        scenario: "gpc_enabled",
        consentStateAtEnd: "pre_consent",
        startedAtMs: 1_000,
        completedAtMs: 2_000,
        networkEventCount: 1,
        cookieEventCount: 0,
      },
    },
    confidence: 0.9,
    coverageLimitations: [],
    evidenceRefs: [{ refId: "ref_comparison_gpc_adtech_suppression", eventType: "consent_comparison", label: "GPC adtech suppression comparison" }],
  };
}

function postOptOutGpcAdvertisingSuppressionComparison(): JsonRecord {
  return {
    comparisonId: "comparison_post_opt_out_gpc_advertising_suppression",
    comparedScenarios: "fresh_pre_consent_vs_after_reject",
    vendorsPersistingAfterReject: [],
    vendorsSuppressedAfterReject: ["Google Ads / DoubleClick"],
    vendorsAppearingOnlyAfterAccept: [],
    cookiesPersistingAfterReject: [],
    cookiesSetAfterAccept: [],
    collectionEndpointsPersistingAfterReject: [],
    collectionEndpointsSuppressedAfterReject: ["googleads.g.doubleclick.net/pagead/id"],
    collectionEndpointsAppearingOnlyAfterAccept: [],
    requestCountDeltaByVendor: { "Google Ads / DoubleClick": -1 },
    cookieCountDeltaByVendor: { "Google Ads / DoubleClick": -1 },
    journeyPhaseDeltas: [
      {
        journeyKey: "cookie:ide",
        displayName: "IDE",
        vendor: "Google",
        product: "Google Ads / DoubleClick",
        cookieName: "IDE",
        observedPreConsent: true,
        observedAfterReject: false,
        suppressedAfterReject: true,
        evidenceRefs: [{ refId: "ref_post_opt_out_gpc_ad_cookie_suppressed", label: "Advertising cookie suppressed after GPC opt-out" }],
      },
    ],
    comparableMeasurement: {
      comparable: true,
      preActionWindow: {
        scenario: "baseline_pre_consent",
        consentStateAtEnd: "pre_consent",
        startedAtMs: 0,
        completedAtMs: 1_000,
        networkEventCount: 1,
        cookieEventCount: 1,
      },
      postActionWindow: {
        scenario: "gpc_enabled",
        consentStateAtEnd: "pre_consent",
        startedAtMs: 1_000,
        completedAtMs: 2_000,
        networkEventCount: 1,
        cookieEventCount: 0,
      },
    },
    confidence: 0.9,
    coverageLimitations: [],
    evidenceRefs: [
      { refId: "ref_comparison_post_opt_out_gpc_advertising_suppression", eventType: "consent_comparison", label: "Post-opt-out GPC advertising suppression comparison" },
    ],
  };
}

function gpcPolicySurface(): JsonRecord {
  return {
    observationId: "policy_gpc_disclosure",
    sourceScanner: "policy_surface",
    scenario: "policy_surface_review",
    consentStateAtTime: "not_applicable",
    surfaceType: "privacy_policy",
    url: "https://fixture.certscore.test/privacy",
    normalizedUrl: "https://fixture.certscore.test/privacy",
    linkText: "Privacy Notice",
    discoveryMethod: "deterministic_keyword_match",
    status: "fetched",
    httpStatus: 200,
    fetchable: true,
    title: "Privacy Notice",
    textExcerpt: "We recognize Global Privacy Control (GPC) as an opt-out preference signal for sale, share, and targeted advertising choices.",
    boundedTextExcerptIds: ["excerpt_gpc_disclosure"],
    observedTopics: ["global_privacy_control", "sale_or_share", "targeted_advertising"],
    mentionedVendors: [],
    mentionedPurposes: ["targeted advertising"],
    mentionedRights: ["opt-out preference signal"],
    mentionedControls: ["Global Privacy Control"],
    evidenceRefs: [{ refId: "ref_policy_gpc_disclosure", eventType: "policy_surface_placeholder", label: "GPC disclosure excerpt" }],
    artifactRefs: [],
    assistMetadata: [],
    confidence: 0.9,
    directVsInferred: "direct",
  };
}

function gpcRecognitionObservation(observationId: string): JsonRecord {
  return {
    observationId,
    sourceScanner: "consent_flow_runtime",
    scenario: "gpc_enabled",
    consentStateAtTime: "pre_consent",
    bannerLikelyPresent: false,
    actionCandidates: [],
    actionAttempts: [],
    textExcerpt: "Global Privacy Control detected and applied as an opt-out preference signal.",
    evidenceRefs: [{ refId: `ref_${observationId}`, label: "GPC recognition text" }],
    artifactRefs: [],
    confidence: 0.9,
    directVsInferred: "direct",
  };
}

function gpcAdtechNetworkEvent(eventId: string): JsonRecord {
  return cloneNetworkEvent(fixtureAnalyticsRequestEvent, {
    attributionReason: "synthetic_gpc_adtech_probe",
    attributionStatus: "resolved",
    consentStateAtTime: "pre_consent",
    endpointCategory: "advertising_collection",
    eventId,
    hostname: "googleads.g.doubleclick.net",
    path: "/pagead/id",
    queryParamNames: ["gclsrc"],
    registrableDomain: "doubleclick.net",
    relatedEvidenceRefs: [],
    requestHeaders: {
      cookieHeaderPresent: false,
      cookieNames: [],
      authorizationHeaderPresent: false,
      secGpc: "1",
    },
    requestHostname: "googleads.g.doubleclick.net",
    requestId: `req_${eventId}`,
    requestUrl: "https://googleads.g.doubleclick.net/pagead/id?gclsrc=fixture",
    resolverBasis: ["endpoint_category:advertising_collection", "gpc_probe"],
    scenario: "gpc_enabled",
    timestampMs: 1_600,
    url: "https://googleads.g.doubleclick.net/pagead/id?gclsrc=fixture",
    normalizedUrl: "https://googleads.g.doubleclick.net/pagead/id?gclsrc=fixture",
  });
}

function privacyChoicesLinkSurface(): JsonRecord {
  return {
    observationId: "policy_privacy_choices_link",
    sourceScanner: "policy_surface",
    scenario: "policy_surface_review",
    consentStateAtTime: "not_applicable",
    surfaceType: "your_privacy_choices",
    url: "https://fixture.certscore.test/privacy-choices",
    normalizedUrl: "https://fixture.certscore.test/privacy-choices",
    linkText: "Your Privacy Choices",
    discoveryMethod: "footer_link",
    status: "fetched",
    httpStatus: 200,
    fetchable: true,
    title: "Your Privacy Choices",
    textExcerpt: "",
    boundedTextExcerptIds: [],
    observedTopics: [],
    mentionedVendors: [],
    mentionedPurposes: [],
    mentionedRights: [],
    mentionedControls: [],
    evidenceRefs: [{
      refId: "ref_policy_privacy_choices_link",
      eventType: "policy_surface_placeholder",
      label: "Your Privacy Choices link",
      url: "https://fixture.certscore.test/privacy-choices",
    }],
    artifactRefs: [],
    assistMetadata: [],
    confidence: 0.7,
    directVsInferred: "direct",
  };
}

function saleSharePolicyContextSurface(): JsonRecord {
  return {
    observationId: "policy_sale_share_context",
    sourceScanner: "policy_surface",
    scenario: "policy_surface_review",
    consentStateAtTime: "not_applicable",
    surfaceType: "privacy_policy",
    url: "https://fixture.certscore.test/privacy",
    normalizedUrl: "https://fixture.certscore.test/privacy",
    linkText: "Privacy Notice",
    discoveryMethod: "footer_link",
    status: "fetched",
    httpStatus: 200,
    fetchable: true,
    title: "Privacy Notice",
    textExcerpt: "You may opt out of sale or sharing and targeted advertising by clicking Your Privacy Choices.",
    boundedTextExcerptIds: ["excerpt_sale_share_context"],
    observedTopics: ["sale_or_share", "targeted_advertising"],
    mentionedVendors: [],
    mentionedPurposes: ["targeted advertising"],
    mentionedRights: ["do_not_sell_or_share"],
    mentionedControls: ["Your Privacy Choices"],
    evidenceRefs: [{
      refId: "ref_policy_sale_share_context",
      eventType: "policy_surface_placeholder",
      label: "Privacy notice sale/share context",
      excerpt: "You may opt out of sale or sharing and targeted advertising by clicking Your Privacy Choices.",
      url: "https://fixture.certscore.test/privacy",
    }],
    artifactRefs: [],
    assistMetadata: [],
    confidence: 0.88,
    directVsInferred: "direct",
  };
}

function privacyPolicyCookieNoticeReferenceSurface(): JsonRecord {
  return {
    observationId: "policy_privacy_cookie_notice_reference",
    sourceScanner: "policy_surface",
    scenario: "policy_surface_review",
    consentStateAtTime: "not_applicable",
    surfaceType: "privacy_policy",
    url: "https://fixture.certscore.test/privacy",
    normalizedUrl: "https://fixture.certscore.test/privacy",
    linkText: "Privacy Policy",
    discoveryMethod: "footer_link",
    status: "fetched",
    httpStatus: 200,
    fetchable: true,
    title: "Privacy Policy",
    textExcerpt: "Our Cookies Notice explains how we use cookies for analytics, advertising, and consent preferences.",
    boundedTextExcerptIds: ["excerpt_cookie_notice_reference"],
    observedTopics: ["cookies", "analytics", "advertising"],
    mentionedVendors: [],
    mentionedPurposes: ["analytics", "advertising"],
    mentionedRights: [],
    mentionedControls: ["Cookies Notice"],
    evidenceRefs: [{
      refId: "ref_policy_cookie_notice_reference",
      eventType: "policy_surface_placeholder",
      label: "Privacy policy cookie notice reference excerpt",
      excerpt: "Our Cookies Notice explains how we use cookies for analytics, advertising, and consent preferences.",
      url: "https://fixture.certscore.test/privacy",
    }],
    artifactRefs: [],
    assistMetadata: [],
    confidence: 0.84,
    directVsInferred: "direct",
  };
}

function cookieSettingsOnlySurface(): JsonRecord {
  return {
    observationId: "policy_cookie_settings_only",
    sourceScanner: "policy_surface",
    scenario: "policy_surface_review",
    consentStateAtTime: "not_applicable",
    surfaceType: "cookie_settings",
    url: "https://fixture.certscore.test/",
    normalizedUrl: "https://fixture.certscore.test/",
    linkText: "Cookie Settings",
    discoveryMethod: "footer_link",
    status: "observed",
    httpStatus: 200,
    fetchable: true,
    title: "Cookie Settings",
    textExcerpt: "",
    boundedTextExcerptIds: [],
    observedTopics: ["cookie_settings"],
    mentionedVendors: [],
    mentionedPurposes: [],
    mentionedRights: [],
    mentionedControls: ["Cookie Settings"],
    evidenceRefs: [{
      refId: "ref_cookie_settings_only",
      eventType: "policy_surface_placeholder",
      label: "Cookie Settings link",
      url: "https://fixture.certscore.test/",
    }],
    artifactRefs: [],
    assistMetadata: [],
    confidence: 0.9,
    directVsInferred: "direct",
  };
}

function noticeAtCollectionSurface(): JsonRecord {
  return {
    observationId: "policy_notice_at_collection_surface",
    sourceScanner: "policy_surface",
    scenario: "policy_surface_review",
    consentStateAtTime: "not_applicable",
    surfaceType: "notice_at_collection",
    url: "https://fixture.certscore.test/notice-at-collection",
    normalizedUrl: "https://fixture.certscore.test/notice-at-collection",
    linkText: "Notice at Collection",
    discoveryMethod: "footer_link",
    status: "fetched",
    httpStatus: 200,
    fetchable: true,
    title: "Notice at Collection",
    textExcerpt: "Notice at Collection: we describe categories of information collected when you submit this form and link to privacy choices.",
    boundedTextExcerptIds: ["excerpt_notice_at_collection"],
    observedTopics: ["notice_at_collection", "california_privacy_rights"],
    mentionedVendors: [],
    mentionedPurposes: ["form submission"],
    mentionedRights: ["privacy choices"],
    mentionedControls: ["Privacy Choices"],
    evidenceRefs: [{
      refId: "ref_policy_notice_at_collection",
      eventType: "policy_surface_placeholder",
      label: "Notice at Collection bounded excerpt",
      excerpt: "Notice at Collection: we describe categories of information collected when you submit this form and link to privacy choices.",
      url: "https://fixture.certscore.test/notice-at-collection",
    }],
    artifactRefs: [],
    assistMetadata: [],
    confidence: 0.9,
    directVsInferred: "direct",
  };
}

function genericPolicyNoticeAtCollectionSurface(): JsonRecord {
  return {
    observationId: "policy_generic_notice_at_collection_topic",
    sourceScanner: "policy_surface",
    scenario: "policy_surface_review",
    consentStateAtTime: "not_applicable",
    surfaceType: "privacy_policy",
    url: "https://fixture.certscore.test/privacy",
    normalizedUrl: "https://fixture.certscore.test/privacy",
    linkText: "Privacy Policy",
    discoveryMethod: "footer_link",
    status: "fetched",
    httpStatus: 200,
    fetchable: true,
    title: "Privacy Policy",
    textExcerpt: "This privacy policy includes our notice at collection for California residents.",
    boundedTextExcerptIds: ["excerpt_generic_notice_at_collection_topic"],
    observedTopics: ["notice_at_collection", "california_privacy_rights"],
    mentionedVendors: [],
    mentionedPurposes: [],
    mentionedRights: [],
    mentionedControls: [],
    evidenceRefs: [{
      refId: "ref_policy_generic_notice_at_collection",
      eventType: "policy_surface_placeholder",
      label: "Generic policy Notice at Collection mention",
      excerpt: "This privacy policy includes our notice at collection for California residents.",
      url: "https://fixture.certscore.test/privacy",
    }],
    artifactRefs: [],
    assistMetadata: [],
    confidence: 0.92,
    directVsInferred: "direct",
  };
}

function policyVendorAlignmentSurface(): JsonRecord {
  return {
    observationId: "policy_vendor_alignment_surface",
    sourceScanner: "policy_surface",
    scenario: "policy_surface_review",
    consentStateAtTime: "not_applicable",
    surfaceType: "privacy_policy",
    url: "https://fixture.certscore.test/privacy",
    normalizedUrl: "https://fixture.certscore.test/privacy",
    linkText: "Privacy Policy",
    discoveryMethod: "footer_link",
    status: "fetched",
    httpStatus: 200,
    fetchable: true,
    title: "Privacy Policy",
    textExcerpt: "We use Google Ads / DoubleClick for advertising measurement and cross-site advertising preferences.",
    boundedTextExcerptIds: ["excerpt_vendor_alignment"],
    observedTopics: ["cookies", "advertising", "targeted_advertising"],
    mentionedVendors: ["Google Ads / DoubleClick"],
    mentionedPurposes: ["advertising"],
    mentionedRights: [],
    mentionedControls: ["advertising preferences"],
    evidenceRefs: [{
      refId: "ref_policy_vendor_alignment",
      eventType: "policy_surface_placeholder",
      label: "Bounded policy vendor mention excerpt",
      excerpt: "We use Google Ads / DoubleClick for advertising measurement and cross-site advertising preferences.",
      url: "https://fixture.certscore.test/privacy",
    }],
    artifactRefs: [],
    assistMetadata: [],
    confidence: 0.9,
    directVsInferred: "direct",
  };
}

function policyVendorAnalyticsAlignmentSurface(): JsonRecord {
  return {
    observationId: "policy_vendor_analytics_alignment_surface",
    sourceScanner: "policy_surface",
    scenario: "policy_surface_review",
    consentStateAtTime: "not_applicable",
    surfaceType: "privacy_policy",
    url: "https://fixture.certscore.test/privacy",
    normalizedUrl: "https://fixture.certscore.test/privacy",
    linkText: "Privacy Policy",
    discoveryMethod: "footer_link",
    status: "fetched",
    httpStatus: 200,
    fetchable: true,
    title: "Privacy Policy",
    textExcerpt: "We use Google Analytics to measure site usage and understand aggregate analytics trends.",
    boundedTextExcerptIds: ["excerpt_vendor_analytics_alignment"],
    observedTopics: ["cookies", "analytics"],
    mentionedVendors: ["Google Analytics"],
    mentionedPurposes: ["analytics"],
    mentionedRights: [],
    mentionedControls: [],
    evidenceRefs: [{
      refId: "ref_policy_vendor_analytics_alignment",
      eventType: "policy_surface_placeholder",
      label: "Bounded policy analytics vendor mention excerpt",
      excerpt: "We use Google Analytics to measure site usage and understand aggregate analytics trends.",
      url: "https://fixture.certscore.test/privacy",
    }],
    artifactRefs: [],
    assistMetadata: [],
    confidence: 0.9,
    directVsInferred: "direct",
  };
}

function policyVendorNoOverlapSurface(): JsonRecord {
  return {
    observationId: "policy_vendor_no_overlap_surface",
    sourceScanner: "policy_surface",
    scenario: "policy_surface_review",
    consentStateAtTime: "not_applicable",
    surfaceType: "privacy_policy",
    url: "https://fixture.certscore.test/privacy",
    normalizedUrl: "https://fixture.certscore.test/privacy",
    linkText: "Privacy Policy",
    discoveryMethod: "footer_link",
    status: "fetched",
    httpStatus: 200,
    fetchable: true,
    title: "Privacy Policy",
    textExcerpt: "We use Example Ads for advertising measurement and cross-site advertising preferences.",
    boundedTextExcerptIds: ["excerpt_vendor_no_overlap"],
    observedTopics: ["cookies", "advertising", "targeted_advertising"],
    mentionedVendors: ["Example Ads"],
    mentionedPurposes: ["advertising"],
    mentionedRights: [],
    mentionedControls: ["advertising preferences"],
    evidenceRefs: [{
      refId: "ref_policy_vendor_no_overlap",
      eventType: "policy_surface_placeholder",
      label: "Bounded policy vendor no-overlap excerpt",
      excerpt: "We use Example Ads for advertising measurement and cross-site advertising preferences.",
      url: "https://fixture.certscore.test/privacy",
    }],
    artifactRefs: [],
    assistMetadata: [],
    confidence: 0.9,
    directVsInferred: "direct",
  };
}

function policyVendorLinkOnlySurface(): JsonRecord {
  return {
    observationId: "policy_vendor_link_only_surface",
    sourceScanner: "policy_surface",
    scenario: "policy_surface_review",
    consentStateAtTime: "not_applicable",
    surfaceType: "privacy_policy",
    url: "https://fixture.certscore.test/privacy",
    normalizedUrl: "https://fixture.certscore.test/privacy",
    linkText: "Privacy Policy",
    discoveryMethod: "footer_link",
    status: "observed",
    httpStatus: 200,
    fetchable: true,
    title: "Privacy Policy",
    textExcerpt: undefined,
    boundedTextExcerptIds: [],
    observedTopics: ["cookies", "advertising", "targeted_advertising"],
    mentionedVendors: ["Google Ads / DoubleClick"],
    mentionedPurposes: ["advertising"],
    mentionedRights: [],
    mentionedControls: ["advertising preferences"],
    evidenceRefs: [],
    artifactRefs: [],
    assistMetadata: [],
    confidence: 0.72,
    directVsInferred: "direct",
  };
}

function cloneNetworkEvent(event: JsonRecord, overrides: JsonRecord): JsonRecord {
  return {
    ...event,
    evidenceRefs: [{ refId: `ref_${overrides.eventId ?? event.eventId}`, eventType: "network_request", label: "Synthetic bounded request" }],
    ...overrides,
  };
}

function withPhaseDelta(journey: JsonRecord, phaseDelta: JsonRecord | undefined): JsonRecord {
  return {
    ...journey,
    scenariosObserved: ["fresh_pre_consent", "reject_all_flow"],
    consentStatesObserved: ["pre_consent", "post_reject"],
    phaseDeltas: phaseDelta ? [phaseDelta] : [],
  };
}

function gpcJourney(event: JsonRecord): JsonRecord {
  return {
    journeyId: "journey_gpc_probe",
    journeyType: "endpoint",
    key: "endpoint:gpc_probe",
    displayName: "GPC runtime probe",
    entity: "Fixture",
    sourceScanner: "consent_flow_runtime",
    scenariosObserved: ["gpc_enabled"],
    firstObservedAtMs: event.timestampMs,
    lastObservedAtMs: event.timestampMs,
    firstObservedConsentState: "pre_consent",
    consentStatesObserved: ["pre_consent"],
    firstPartyOrThirdParty: "third_party",
    entryPoint: event.requestUrl,
    entryPointSourceEventId: event.eventId,
    relatedCookies: [],
    relatedScripts: [],
    relatedEndpoints: [event.requestUrl],
    relatedVendors: [],
    relatedVendorObservationIds: [],
    observedBehaviors: ["third_party_request_observed", "collection_endpoint_observed"],
    eventRefs: [{
      eventId: event.eventId,
      eventType: event.eventType,
      timestampMs: event.timestampMs,
      url: event.requestUrl,
      behavior: "collection_endpoint_observed",
      scenario: "gpc_enabled",
      consentStateAtTime: "pre_consent",
    }],
    phaseDeltas: [],
    confidence: 0.9,
    directVsInferred: "direct",
    evidenceRefs: [{ refId: `ref_${event.eventId}`, eventId: event.eventId, eventType: event.eventType, url: event.requestUrl }],
  };
}

function journeySummary(journeys: JsonRecord[]): JsonRecord {
  return {
    activeCollectionJourneyCount: journeys.filter((journey) =>
      journey.observedBehaviors.includes("collection_endpoint_observed") ||
      journey.observedBehaviors.includes("cookie_set")
    ).length,
    consentManagementJourneyCount: 0,
    cookieJourneyCount: journeys.filter((journey) => journey.journeyType === "cookie").length,
    endpointJourneyCount: journeys.filter((journey) => journey.journeyType === "endpoint").length,
    journeyCount: journeys.length,
    notes: [],
    productJourneyCount: journeys.filter((journey) => journey.journeyType === "product").length,
    scriptJourneyCount: journeys.filter((journey) => journey.journeyType === "script").length,
    trackerJourneyCount: journeys.filter((journey) => journey.journeyType === "tracker").length,
    vendorJourneyCount: journeys.filter((journey) => journey.journeyType === "vendor").length,
  };
}

function emptyJourneySummary(): JsonRecord {
  return journeySummary([]);
}

function guardrails() {
  return [
    "CertScore v2 internal diagnostic fixture only.",
    "Artifact-only; do not wire into WC01 production reports, scoring, normalized concerns, or customer-facing copy.",
    "Display-safe bounded synthetic evidence; no raw cookies, request bodies, sensitive query values, unbounded policy text, or raw model reasoning.",
    "Review output is generated by the v2 review engine and remains internal-only.",
  ];
}

function renderReadme(index: {
  fixtureIndexVersion: string;
  generatedAt: string;
  sourceStage2Dir: string;
  summary: { failed: number; fixtures: number; passed: number };
  entries: FixtureIndexEntry[];
}) {
  return [
    "# WC01 v2 Regulatory Diagnostics Stage 3 Synthetic Fixtures",
    "",
    "Internal diagnostic only. Artifact-only. Non-persistent. Not customer-facing report output.",
    "",
    "This directory contains bounded synthetic CanonicalEvidenceBundle fixtures and ReviewResult outputs generated through the v2 review engine. The fixtures target the highest-value unstable live coverage lanes from Stage 2.",
    "",
    "## Summary",
    "",
    `- Fixtures: ${index.summary.fixtures}`,
    `- Passed: ${index.summary.passed}`,
    `- Failed: ${index.summary.failed}`,
    "",
    "## Fixtures",
    "",
    ...index.entries.map((entry) =>
      `- ${entry.status} ${entry.fixtureId}: expects ${entry.expectedEligibleFindingKeys.join(", ") || "(none)"}${entry.forbiddenEligibleFindingKeys.length > 0 ? `; forbids ${entry.forbiddenEligibleFindingKeys.join(", ")}` : ""}`
    ),
    "",
    "## Command",
    "",
    "```bash",
    "pnpm v2:regulatory-gold-corpus-fixtures",
    "```",
    "",
  ].join("\n");
}

function candidateCheckFailureDetails(review: JsonRecord, checks: FixtureCandidateCheck[]) {
  return checks.flatMap((check) => {
    const candidate = (review.findingCandidates ?? []).find((item: JsonRecord) => item.findingKey === check.findingKey);
    if (!candidate) {
      return [`${check.findingKey}:candidate_missing`];
    }
    const failures: string[] = [];
    if (check.eligibilityStatus && candidate.eligibility?.status !== check.eligibilityStatus) {
      failures.push(`${check.findingKey}:eligibility=${candidate.eligibility?.status ?? "missing"}!=${check.eligibilityStatus}`);
    }
    for (const criterion of check.matchedCriteriaIncludes ?? []) {
      if (!(candidate.matchedCriteria ?? []).includes(criterion)) {
        failures.push(`${check.findingKey}:matchedCriteria_missing:${criterion}`);
      }
    }
    for (const corroborator of check.missingCorroboratorsIncludes ?? []) {
      if (!(candidate.missingCorroborators ?? []).includes(corroborator)) {
        failures.push(`${check.findingKey}:missingCorroborator_missing:${corroborator}`);
      }
    }
    for (const reason of check.demotionReasonsIncludes ?? []) {
      if (!(candidate.demotionReasons ?? []).includes(reason)) {
        failures.push(`${check.findingKey}:demotionReason_missing:${reason}`);
      }
    }
    if (typeof check.confidenceMin === "number" && (candidate.confidence ?? 0) < check.confidenceMin) {
      failures.push(`${check.findingKey}:confidence=${candidate.confidence ?? "missing"}<${check.confidenceMin}`);
    }
    if (typeof check.confidenceMax === "number" && (candidate.confidence ?? 0) > check.confidenceMax) {
      failures.push(`${check.findingKey}:confidence=${candidate.confidence ?? "missing"}>${check.confidenceMax}`);
    }
    return failures;
  });
}

async function writeJson(filePath: string, value: unknown) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    failOnMissing: false,
    help: false,
    outDir: DEFAULT_OUT_DIR,
    stage2Dir: path.join("artifacts", "gold-corpus", "v2-20260613-stage2"),
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--stage2-dir") {
      args.stage2Dir = requiredValue(argv, ++index, arg);
    } else if (arg === "--out-dir") {
      args.outDir = requiredValue(argv, ++index, arg);
    } else if (arg === "--fail-on-missing") {
      args.failOnMissing = true;
    } else if (arg === "--help" || arg === "-h") {
      args.help = true;
    } else {
      throw new Error(`Unknown argument: ${arg}\n\n${usage()}`);
    }
  }
  return args;
}

function requiredValue(argv: string[], index: number, flag: string) {
  const value = argv[index];
  if (!value) {
    throw new Error(`Missing value for ${flag}.`);
  }
  return value;
}

function usage() {
  return [
    "Usage:",
    "  node --import tsx scripts/build-v2-regulatory-gold-corpus-stage3-fixtures.ts [--stage2-dir <dir>] [--out-dir <dir>] [--fail-on-missing]",
    "",
    "Builds bounded synthetic v2 Regulatory Diagnostics fixtures and validates them through the review engine.",
  ].join("\n");
}
