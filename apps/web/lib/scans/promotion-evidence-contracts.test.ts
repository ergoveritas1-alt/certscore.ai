import assert from "node:assert/strict";
import test from "node:test";

import { getContradictionEvidenceBundle } from "./contradiction-evidence-contract";
import { POLICY_BEHAVIOR_CONFLICT_FIXTURES } from "./policy-behavior-conflict.fixtures";
import {
  evaluateConsentGatedTrackingConflictContract,
  evaluatePolicyBehaviorConflictContract,
  hasConcretePreconsentArtifact,
  hasPreconsentSequenceEvidence,
  hasStrongPreconsentRuntimeEvidence
} from "./promotion-evidence-contracts";
import { buildSanitizedNetworkEvidenceAuditRecord } from "./sanitized-network-evidence";

test("policy behavior conflict fixtures parse into the structured contradiction schema", () => {
  const bundle = getContradictionEvidenceBundle(POLICY_BEHAVIOR_CONFLICT_FIXTURES.positiveNecessaryOnlyPreconsent);

  assert.ok(bundle);
  assert.equal(bundle?.policyAnchor.claimType, "only_necessary_cookies_before_choice");
  assert.equal(bundle?.runtimeAnchor.observationType, "marketing_vendor_fired_pre_consent");
  assert.equal(bundle?.runtimeAnchor.phase, "pre_consent");
  assert.equal(
    bundle?.conflictBridge.conflictType,
    "declared_only_necessary_cookies_before_choice_but_non_essential_tracking_fired"
  );
  assert.equal(bundle?.evidenceSufficiency.promotionEligible, true);
});

test("contradiction evidence canonicalizes legacy snake_case fields before parsing", () => {
  const bundle = getContradictionEvidenceBundle({
    claim: "We only use necessary cookies before consent.",
    contradiction_basis: "Observed marketing tags before consent.",
    policy_snippet: "We only use necessary cookies before consent.",
    policy_source_url: "https://example.com/privacy",
    policy_summary_short: "We only use necessary cookies before consent.",
    runtime_evidence_artifacts: ["Marketing vendor fired before consent."],
    runtime_summary: "Marketing vendor fired before consent.",
    runtime_vendors: ["ExampleAds"],
    related_vendors: ["ExampleAds"],
    source_urls: ["https://example.com/privacy"],
    supporting_signals: ["policy_runtime_functional_misalignment_detected"],
    policy_anchor: {
      claim_type: "only_necessary_cookies_before_choice",
      source_url: "https://example.com/privacy",
      snippet: "We only use necessary cookies before consent.",
      normalized_claim: "We only use necessary cookies before consent.",
      extraction_status: "complete"
    },
    runtime_anchor: {
      observation_type: "marketing_vendor_fired_pre_consent",
      runtime_phase: "pre_consent",
      source_url: "https://example.com/privacy",
      runtime_vendors: ["ExampleAds"],
      request_urls: ["https://ads.example.com/pixel"],
      cookie_names: ["ad_id"],
      storage_artifacts: ["ad_storage"]
    },
    conflict_bridge: {
      conflict_type: "declared_only_necessary_cookies_before_choice_but_non_essential_tracking_fired",
      bridge_reasoning: "Observed runtime behavior conflicts with the policy claim.",
      supports_promotion: true
    },
    evidence_sufficiency: {
      policy_anchor_present: true,
      runtime_anchor_present: true,
      conflict_bridge_present: true,
      promotion_eligible: true,
      review_status: "complete"
    }
  });

  assert.ok(bundle);
  assert.equal(bundle?.policyAnchor.claimType, "only_necessary_cookies_before_choice");
  assert.equal(bundle?.runtimeAnchor.observationType, "marketing_vendor_fired_pre_consent");
  assert.equal(bundle?.policySourceUrl, "https://example.com/privacy");
  assert.deepEqual(bundle?.runtimeAnchor.requests, ["https://ads.example.com/pixel"]);
  assert.equal(bundle?.evidenceSufficiency.reviewStatus, "complete");
});

test("policy behavior conflict contract accepts contradiction-grade positive fixtures", () => {
  const cases = [
    POLICY_BEHAVIOR_CONFLICT_FIXTURES.positiveGpcNotHonored,
    POLICY_BEHAVIOR_CONFLICT_FIXTURES.positiveNecessaryOnlyPreconsent,
    POLICY_BEHAVIOR_CONFLICT_FIXTURES.positiveTrackingAfterReject
  ];

  for (const fixture of cases) {
    const decision = evaluatePolicyBehaviorConflictContract(fixture);
    assert.deepEqual(decision, {
      allowedNarrativeTier: "strong",
      promotionEligibility: "eligible",
      externalSurfacingEligibility: "eligible",
      negativeEvidenceFlags: []
    });
  }
});

test("pre-consent cookie evidence is promotion-grade only for non-essential cookies", () => {
  const analyticsCookieEvidence = {
    preconsent_cookie_evidence: [
      {
        category: "analytics",
        cookieName: "_ga",
        nonEssential: true,
        timingEvidence: "before_consent_cookie_write"
      }
    ],
    preconsent_cookie_names: ["_ga"],
    preconsent_nonessential_cookie_names: ["_ga"],
    preconsent_tracking_detected: true,
    supportingSignals: ["privacy.preconsent_tracking_detected"]
  };

  assert.equal(hasConcretePreconsentArtifact(analyticsCookieEvidence), true);
  assert.equal(hasStrongPreconsentRuntimeEvidence(analyticsCookieEvidence), true);

  const adobeCookieEvidence = {
    preconsent_cookie_evidence: [
      {
        cookieName: "demdex",
        timingEvidence: "before_consent_cookie_write"
      },
      {
        cookieName: "QSI_ReplaySession_Info_ZN_8DiCwx5sYuF137L",
        timingEvidence: "before_consent_cookie_write"
      }
    ],
    preconsent_cookie_names: ["demdex", "QSI_ReplaySession_Info_ZN_8DiCwx5sYuF137L"],
    preconsent_tracking_detected: true,
    supportingSignals: ["privacy.preconsent_tracking_detected"]
  };

  assert.equal(hasConcretePreconsentArtifact(adobeCookieEvidence), true);
  assert.equal(hasStrongPreconsentRuntimeEvidence(adobeCookieEvidence), true);

  const infrastructureCookieEvidence = {
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
  };

  assert.equal(hasConcretePreconsentArtifact(infrastructureCookieEvidence), false);
  assert.equal(hasStrongPreconsentRuntimeEvidence(infrastructureCookieEvidence), false);

  const initialSnapshotOnlyEvidence = {
    preconsent_cookie_evidence: [
      {
        category: "advertising",
        cookieName: "_fbp",
        nonEssential: true,
        timingEvidence: "initial_cookie_snapshot"
      }
    ],
    preconsent_cookie_names: ["_fbp"],
    preconsent_nonessential_cookie_names: ["_fbp"],
    preconsent_tracking_detected: true,
    supportingSignals: ["privacy.preconsent_tracking_detected"]
  };

  assert.equal(hasConcretePreconsentArtifact(initialSnapshotOnlyEvidence), false);
  assert.equal(hasStrongPreconsentRuntimeEvidence(initialSnapshotOnlyEvidence), false);
});

test("pre-consent cookie write timestamp satisfies sequence for classified tracking cookies", () => {
  const evidence = {
    consentTimeline: {
      firstCmpVisibleMs: 1000,
      firstConsentActionMs: 1500,
      firstTrackingCookieSetMs: 250
    },
    preconsent_cookie_evidence: [
      {
        category: "advertising",
        cookieName: "_fbp",
        nonEssential: true,
        timingEvidence: "before_consent_cookie_write"
      }
    ],
    preconsent_cookie_names: ["_fbp"],
    preconsent_nonessential_cookie_names: ["_fbp"],
    preconsent_tracking_detected: true,
    supportingSignals: ["privacy.preconsent_tracking_detected"]
  };

  assert.equal(hasConcretePreconsentArtifact(evidence), true);
  assert.equal(hasPreconsentSequenceEvidence(evidence), true);
  assert.equal(hasStrongPreconsentRuntimeEvidence(evidence), true);
});

test("pre-consent source URLs remain review-grade sequence evidence", () => {
  const sourceUrlEvidence = {
    consentTimeline: {
      firstCmpVisibleMs: 500,
      firstConsentActionMs: 800,
      firstNonEssentialRequestMs: 100
    },
    requestPurposeClassificationConfidence: [
      {
        confidence: 0.91,
        essentiality: "non_essential",
        requestUrl: "https://analytics.example.com/collect"
      }
    ],
    signalKey: "privacy.preconsent_tracking_detected",
    signalValue: true,
    sourceUrls: ["https://analytics.example.com/collect"]
  };

  assert.equal(hasConcretePreconsentArtifact(sourceUrlEvidence), true);
  assert.equal(hasStrongPreconsentRuntimeEvidence(sourceUrlEvidence), true);

  const malformedUrlEvidence = {
    consentTimeline: {
      firstCmpVisibleMs: 500,
      firstConsentActionMs: 800,
      firstNonEssentialRequestMs: 100
    },
    signalKey: "privacy.preconsent_tracking_detected",
    signalValue: true,
    sourceUrls: ["https://www.sofi.com_oeu1776902307725r0.1932886381308404$$14812420277$$session_state"]
  };

  assert.equal(hasConcretePreconsentArtifact(malformedUrlEvidence), false);
  assert.equal(hasStrongPreconsentRuntimeEvidence(malformedUrlEvidence), false);
});

test("pre-consent runtime request URLs count as concrete artifacts but still need timeline for strong evidence", () => {
  const runtimeUrlEvidence = {
    runtimeRequestUrls: ["https://www.googletagmanager.com/gtm.js?id=G-EXAMPLE"],
    runtimeVendors: ["Google Tag Manager"],
    signalKey: "privacy.preconsent_tracking_detected",
    signalValue: true
  };

  assert.equal(hasConcretePreconsentArtifact(runtimeUrlEvidence), true);
  assert.equal(hasStrongPreconsentRuntimeEvidence(runtimeUrlEvidence), false);

  assert.equal(
    hasStrongPreconsentRuntimeEvidence({
      ...runtimeUrlEvidence,
      consentTimeline: {
        firstCmpVisibleMs: 500,
        firstConsentActionMs: 800,
        firstNonEssentialRequestMs: 100
      },
      requestPurposeClassificationConfidence: [
        {
          confidence: 0.91,
          essentiality: "non_essential",
          requestUrl: "https://www.googletagmanager.com/gtm.js?id=G-EXAMPLE"
        }
      ]
    }),
    true
  );
});

test("pre-consent request before any recorded choice satisfies sequence when consent controls were observed", () => {
  const evidence = {
    consentActionableChoiceObserved: true,
    consentSurfaceObserved: true,
    consentTimeline: {
      firstAcceptActionMs: null,
      firstCmpVisibleMs: 0,
      firstConsentActionMs: null,
      firstNonEssentialRequestMs: 1660,
      firstRejectActionMs: null,
      firstUserActionMs: null
    },
    requestPurposeClassificationConfidence: [
      {
        confidence: 0.85,
        essentiality: "non_essential",
        requestUrl: "https://tags-eu.tiqcdn.com/utag/example/prod/utag.js",
        timestampMs: 1660
      }
    ],
    runtimeRequestUrls: ["https://tags-eu.tiqcdn.com/utag/example/prod/utag.js"],
    runtimeVendors: ["Tealium"],
    signalKey: "privacy.preconsent_tracking_detected",
    signalValue: true
  };

  assert.equal(hasConcretePreconsentArtifact(evidence), true);
  assert.equal(hasStrongPreconsentRuntimeEvidence(evidence), true);
});

test("pre-consent request without observed consent controls remains review grade", () => {
  const evidence = {
    consentActionableChoiceObserved: false,
    consentSurfaceObserved: false,
    consentTimeline: {
      firstConsentActionMs: null,
      firstNonEssentialRequestMs: 1660
    },
    requestPurposeClassificationConfidence: [
      {
        confidence: 0.85,
        essentiality: "non_essential",
        requestUrl: "https://securepubads.g.doubleclick.net/tag/js/gpt.js",
        timestampMs: 1660
      }
    ],
    runtimeRequestUrls: ["https://securepubads.g.doubleclick.net/tag/js/gpt.js"],
    runtimeVendors: ["Google Ads"],
    signalKey: "privacy.preconsent_tracking_detected",
    signalValue: true
  };

  assert.equal(hasConcretePreconsentArtifact(evidence), true);
  assert.equal(hasStrongPreconsentRuntimeEvidence(evidence), false);
});

test("normalized pre-consent entity URLs count as concrete artifacts but still need timeline for strong evidence", () => {
  const normalizedEntityEvidence = {
    entities: {
      runtimeRequestUrls: ["https://tags.example-cdn.com/utag/site/prod/utag.js"],
      runtimeVendors: ["Tealium"]
    },
    signalKey: "privacy.preconsent_tracking_detected",
    signalValue: true
  };

  assert.equal(hasConcretePreconsentArtifact(normalizedEntityEvidence), true);
  assert.equal(hasStrongPreconsentRuntimeEvidence(normalizedEntityEvidence), false);

  assert.equal(
    hasStrongPreconsentRuntimeEvidence({
      ...normalizedEntityEvidence,
      consentTimeline: {
        firstCmpVisibleMs: 500,
        firstConsentActionMs: 800,
        firstNonEssentialRequestMs: 100
      },
      requestPurposeClassificationConfidence: [
        {
          confidence: 0.91,
          essentiality: "non_essential",
          requestUrl: "https://tags.example-cdn.com/utag/site/prod/utag.js"
        }
      ]
    }),
    true
  );
});

test("policy behavior conflict contract blocks incomplete contradiction fixtures", () => {
  const cases = [
    POLICY_BEHAVIOR_CONFLICT_FIXTURES.negativePolicyNotFetched,
    POLICY_BEHAVIOR_CONFLICT_FIXTURES.negativeGenericPolicyOnly,
    POLICY_BEHAVIOR_CONFLICT_FIXTURES.negativeRuntimeEmpty,
    POLICY_BEHAVIOR_CONFLICT_FIXTURES.negativeNoMapping,
    POLICY_BEHAVIOR_CONFLICT_FIXTURES.negativeGeneralCookiesNoContradiction,
    POLICY_BEHAVIOR_CONFLICT_FIXTURES.negativeSchwabLike
  ];

  for (const fixture of cases) {
    const decision = evaluatePolicyBehaviorConflictContract(fixture);
    assert.equal(decision?.promotionEligibility, "internal_only");
    assert.equal(decision?.externalSurfacingEligibility, "audit_only");
    assert.ok(decision?.negativeEvidenceFlags.includes("insufficient_evidence_for_policy_behavior_conflict"));
  }
});

test("policy behavior conflict contract does not infer promotion without an explicit stored bridge", () => {
  const decision = evaluatePolicyBehaviorConflictContract({
    contradictionEvidence: {
      claim: "We honor Global Privacy Control.",
      contradictionBasis: "GPC traffic continued.",
      policyAnchor: {
        claimType: "gpc_honored",
        confidence: 0.86,
        extractionStatus: "fetched",
        normalizedClaim: "We honor Global Privacy Control.",
        snippet: "We honor Global Privacy Control.",
        sourceUrl: "https://example.com/privacy"
      },
      runtimeAnchor: {
        confidence: 0.84,
        cookies: ["_fbp"],
        observationType: "gpc_signal_not_honored",
        phase: "gpc_enabled",
        requests: ["https://www.facebook.com/tr?id=123"],
        sourceUrl: "https://example.com/",
        storageArtifacts: [],
        vendors: ["Meta Pixel"]
      },
      runtimeEvidenceArtifacts: ["Meta Pixel request observed with GPC enabled."],
      runtimeVendors: ["Meta Pixel"]
    }
  });

  assert.equal(decision?.promotionEligibility, "internal_only");
  assert.equal(decision?.externalSurfacingEligibility, "audit_only");
  assert.ok(decision?.negativeEvidenceFlags.includes("missing_explicit_contradiction_basis"));
  assert.ok(decision?.negativeEvidenceFlags.includes("insufficient_evidence_for_policy_behavior_conflict"));
});

test("schwab regression fixture is downgraded instead of promoted", () => {
  const decision = evaluatePolicyBehaviorConflictContract(POLICY_BEHAVIOR_CONFLICT_FIXTURES.negativeSchwabLike);

  assert.equal(decision?.promotionEligibility, "internal_only");
  assert.ok(decision?.negativeEvidenceFlags.includes("possible_policy_runtime_mismatch"));
  assert.ok(decision?.negativeEvidenceFlags.includes("insufficient_evidence_for_policy_behavior_conflict"));
});

test("policy behavior conflict remains blocked when only a hashed artifact shell is retained", () => {
  const fixture = {
    ...POLICY_BEHAVIOR_CONFLICT_FIXTURES.negativeRuntimeEmpty,
    sanitizedNetworkEvidence: buildSanitizedNetworkEvidenceAuditRecord({
      entries: [],
      summary: {
        gpc: {
          requestCount: 0
        }
      }
    })
  };

  const decision = evaluatePolicyBehaviorConflictContract(fixture);

  assert.equal(decision?.promotionEligibility, "internal_only");
  assert.ok(decision?.negativeEvidenceFlags.includes("runtime_tracking_review_incomplete"));
});

test("consent-gated tracking conflict contract accepts complete policy, runtime URL, and bridge evidence", () => {
  const decision = evaluateConsentGatedTrackingConflictContract({
    contradictionEvidence: {
      claim: "Optional analytics cookies only run after consent.",
      contradictionBasis: "Analytics fired before consent.",
      conflictBridge: {
        conflictType: "declared_only_necessary_cookies_before_choice_but_non_essential_tracking_fired",
        reasoning: "The policy claim says only necessary cookies run before choice, but an analytics request fired pre-consent.",
        supportsPromotion: true
      },
      evidenceSufficiency: {
        conflictBridgePresent: true,
        policyAnchorPresent: true,
        promotionEligible: true,
        reviewStatus: "complete",
        runtimeAnchorPresent: true
      },
      policyAnchor: {
        claimType: "only_necessary_cookies_before_choice",
        confidence: 0.86,
        extractionStatus: "fetched",
        normalizedClaim: "Optional analytics cookies only run after consent.",
        snippet: "Optional analytics cookies only run after consent.",
        sourceUrl: "https://example.com/privacy"
      },
      policySnippet: "Optional analytics cookies only run after consent.",
      policySourceUrl: "https://example.com/privacy",
      runtimeAnchor: {
        confidence: 0.82,
        cookies: [],
        observationType: "analytics_vendor_fired_pre_consent",
        phase: "pre_consent",
        requests: ["https://www.google-analytics.com/g/collect?v=2"],
        sourceUrl: "https://example.com/",
        storageArtifacts: [],
        vendors: ["Google Analytics"]
      },
      runtimeEvidenceArtifacts: ["https://www.google-analytics.com/g/collect?v=2"],
      runtimeSummary: "Google Analytics request fired before consent.",
      runtimeVendors: ["Google Analytics"],
      sourceUrls: ["https://example.com/privacy"],
      supportingSignals: ["consent_gating_claim"]
    }
  });

  assert.deepEqual(decision, {
    allowedNarrativeTier: "strong",
    promotionEligibility: "eligible",
    externalSurfacingEligibility: "eligible",
    negativeEvidenceFlags: []
  });
});

test("consent-gated tracking conflict contract accepts cookie-choice policy anchors", () => {
  const decision = evaluateConsentGatedTrackingConflictContract({
    contradictionEvidence: {
      claim: "Cookie notice explains cookie settings, third-party cookies, analytics, and marketing categories.",
      contradictionBasis: "Marketing requests fired before the visitor completed a consent choice.",
      conflictBridge: {
        conflictType: "declared_cookie_choices_available_but_non_essential_tracking_fired_pre_choice",
        reasoning: "Choice-control policy evidence is paired with concrete pre-consent runtime request URLs.",
        supportsPromotion: true
      },
      evidenceSufficiency: {
        conflictBridgePresent: true,
        policyAnchorPresent: true,
        promotionEligible: true,
        reviewStatus: "complete",
        runtimeAnchorPresent: true
      },
      policyAnchor: {
        claimType: "cookie_preferences_available",
        confidence: 0.72,
        extractionStatus: "fetched",
        normalizedClaim: "The policy surface describes cookie, tracking, or privacy-choice controls available to visitors.",
        snippet: "Cookie notice explains cookie settings, third-party cookies, analytics, and marketing categories.",
        sourceUrl: "https://example.com/cookie-policy"
      },
      runtimeAnchor: {
        confidence: 0.82,
        cookies: [],
        observationType: "marketing_vendor_fired_pre_consent",
        phase: "pre_consent",
        requests: ["https://js.hs-scripts.com/example.js"],
        sourceUrl: "https://example.com/",
        storageArtifacts: [],
        vendors: ["HubSpot"]
      },
      runtimeEvidenceArtifacts: ["https://js.hs-scripts.com/example.js"],
      runtimeVendors: ["HubSpot"],
      sourceUrls: ["https://example.com/cookie-policy"]
    }
  });

  assert.equal(decision?.promotionEligibility, "eligible");
  assert.equal(decision?.externalSurfacingEligibility, "eligible");
  assert.equal(decision?.allowedNarrativeTier, "strong");
});

test("consent-gated tracking conflict contract stays audit-only without concrete runtime request URL", () => {
  const decision = evaluateConsentGatedTrackingConflictContract({
    contradictionEvidence: {
      claim: "Optional analytics cookies only run after consent.",
      contradictionBasis: "Analytics fired before consent.",
      conflictBridge: {
        conflictType: "declared_only_necessary_cookies_before_choice_but_non_essential_tracking_fired",
        reasoning: "The policy claim says only necessary cookies run before choice, but analytics was inferred pre-consent.",
        supportsPromotion: true
      },
      evidenceSufficiency: {
        conflictBridgePresent: true,
        policyAnchorPresent: true,
        promotionEligible: false,
        reviewStatus: "insufficient_evidence_for_policy_behavior_conflict",
        runtimeAnchorPresent: false
      },
      policyAnchor: {
        claimType: "only_necessary_cookies_before_choice",
        confidence: 0.86,
        extractionStatus: "fetched",
        normalizedClaim: "Optional analytics cookies only run after consent.",
        snippet: "Optional analytics cookies only run after consent.",
        sourceUrl: "https://example.com/privacy"
      },
      runtimeAnchor: {
        confidence: 0.82,
        cookies: [],
        observationType: "analytics_vendor_fired_pre_consent",
        phase: "pre_consent",
        requests: [],
        sourceUrl: "https://example.com/",
        storageArtifacts: [],
        vendors: ["Google Analytics"]
      },
      runtimeVendors: ["Google Analytics"],
      sourceUrls: ["https://example.com/privacy"]
    }
  });

  assert.equal(decision?.promotionEligibility, "internal_only");
  assert.equal(decision?.externalSurfacingEligibility, "audit_only");
  assert.ok(decision?.negativeEvidenceFlags.includes("missing_runtime_request_url_evidence"));
});

test("consent-gated tracking conflict retains script hosts as support without treating them as request URLs", () => {
  const decision = evaluateConsentGatedTrackingConflictContract({
    contradictionEvidence: {
      claim: "Optional analytics cookies only run after consent.",
      contradictionBasis: "Analytics fired before consent.",
      conflictBridge: {
        conflictType: "declared_only_necessary_cookies_before_choice_but_non_essential_tracking_fired",
        reasoning: "The policy claim says only necessary cookies run before choice, but analytics host evidence was retained pre-consent.",
        supportsPromotion: true
      },
      evidenceSufficiency: {
        conflictBridgePresent: true,
        policyAnchorPresent: true,
        promotionEligible: false,
        reviewStatus: "insufficient_evidence_for_policy_behavior_conflict",
        runtimeAnchorPresent: true
      },
      policyAnchor: {
        claimType: "only_necessary_cookies_before_choice",
        confidence: 0.86,
        extractionStatus: "fetched",
        normalizedClaim: "Optional analytics cookies only run after consent.",
        snippet: "Optional analytics cookies only run after consent.",
        sourceUrl: "https://example.com/privacy"
      },
      runtimeAnchor: {
        confidence: 0.82,
        cookies: [],
        observationType: "analytics_vendor_fired_pre_consent",
        phase: "pre_consent",
        requests: [],
        sourceUrl: "https://example.com/",
        storageArtifacts: ["script_host:www.google-analytics.com"],
        vendors: ["Google Analytics"]
      },
      runtimeEvidenceArtifacts: ["script_host:www.google-analytics.com"],
      runtimeVendors: ["Google Analytics"],
      sourceUrls: ["https://example.com/privacy"]
    }
  });

  assert.equal(decision?.promotionEligibility, "internal_only");
  assert.equal(decision?.externalSurfacingEligibility, "audit_only");
  assert.ok(!decision?.negativeEvidenceFlags.includes("missing_behavior_side_evidence"));
  assert.ok(decision?.negativeEvidenceFlags.includes("missing_runtime_request_url_evidence"));
});
