import assert from "node:assert/strict";
import test from "node:test";

import { getContradictionEvidenceBundle } from "./contradiction-evidence-contract";
import { POLICY_BEHAVIOR_CONFLICT_FIXTURES } from "./policy-behavior-conflict.fixtures";
import {
  evaluateConsentGatedTrackingConflictContract,
  deriveFingerprintEvidenceTier,
  evaluatePolicyBehaviorConflictContract,
  diagnosePreConsentCookieEvidence,
  hasConcreteCrossDomainIdentifierSharingEvidence,
  hasConcretePreconsentArtifact,
  hasConcreteRtbCookieSyncEvidence,
  hasConcreteSensitiveSessionReplayArtifact,
  hasStrongFingerprintingEvidence,
  hasSensitiveSessionReplaySurfaceCooccurrenceArtifact,
  hasConcreteSensitiveThirdPartyTrackingArtifact,
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
        party: "third_party",
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
        category: "dmp",
        cookieName: "demdex",
        nonEssential: true,
        party: "third_party",
        timingEvidence: "before_consent_cookie_write"
      },
      {
        category: "session_replay",
        cookieName: "QSI_ReplaySession_Info_ZN_8DiCwx5sYuF137L",
        nonEssential: true,
        party: "third_party",
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

test("structured cookie evidence can promote without a request URL, but bare booleans cannot", () => {
  const structuredCookieEvidence = {
    preconsent_cookie_evidence: [
      {
        beforeConsent: true,
        category: "advertising",
        cookieInitiatorVendor: "Amazon Ads",
        cookieName: "ad-privacy",
        cookiePartyType: "third_party",
        domain: ".amazon-adsystem.com",
        responseHost: "amazon-adsystem.com",
        thirdParty: true
      }
    ],
    preconsent_tracking_detected: true,
    third_party_cookie_set_before_consent: true
  };

  assert.equal(hasConcretePreconsentArtifact(structuredCookieEvidence), true);
  assert.equal(hasStrongPreconsentRuntimeEvidence(structuredCookieEvidence), true);

  const bareBooleanEvidence = {
    preconsent_tracking_detected: true,
    third_party_cookie_set_before_consent: true
  };

  assert.equal(hasConcretePreconsentArtifact(bareBooleanEvidence), false);
  assert.equal(hasStrongPreconsentRuntimeEvidence(bareBooleanEvidence), false);
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
        party: "third_party",
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

test("structured before-consent cookie timing satisfies sequence without numeric timeline offsets", () => {
  const evidence = {
    preconsent_cookie_categories: ["advertising"],
    preconsent_cookie_evidence: [
      {
        beforeConsent: true,
        category: "advertising",
        cookieName: "ad-privacy",
        cookiePartyType: "third_party",
        domain: ".amazon-adsystem.com",
        nonEssential: true,
        timingEvidence: "before_consent_cookie_write",
        vendor: "Amazon Ads"
      }
    ],
    preconsent_cookie_names: ["ad-privacy"],
    preconsent_cookie_timing_evidence: ["before_consent_cookie_write"],
    preconsent_nonessential_cookie_names: ["ad-privacy"],
    preconsent_tracking_detected: true
  };

  assert.equal(hasConcretePreconsentArtifact(evidence), true);
  assert.equal(hasPreconsentSequenceEvidence(evidence), true);
  assert.equal(hasStrongPreconsentRuntimeEvidence(evidence), true);
});

test("contextual infrastructure and security request rows do not become strong pre-consent tracking evidence", () => {
  const contextualOnlyEvidence = {
    consentTimeline: {
      firstCmpVisibleMs: 900,
      firstConsentActionMs: null,
      firstNonEssentialRequestMs: 120
    },
    requestPurposeClassificationConfidence: [
      {
        category: "infrastructure",
        classification: "non_essential",
        confidence: 0.97,
        essentiality: "non_essential",
        requestUrl: "https://use.typekit.net/waw8itp.css",
        runtimePhase: "pre_consent",
        vendor: "Adobe Fonts / Typekit"
      },
      {
        category: "security",
        classification: "non_essential",
        confidence: 0.94,
        essentiality: "non_essential",
        requestUrl: "https://www.google.com/recaptcha/api.js",
        runtimePhase: "pre_consent",
        vendor: "Google reCAPTCHA"
      }
    ],
    preconsent_tracking_detected: true
  };

  assert.equal(hasStrongPreconsentRuntimeEvidence(contextualOnlyEvidence), false);

  const advertisingEvidence = {
    consentTimeline: {
      firstCmpVisibleMs: 900,
      firstConsentActionMs: null,
      firstNonEssentialRequestMs: 120
    },
    requestPurposeClassificationConfidence: [
      {
        category: "advertising",
        classification: "non_essential",
        confidence: 0.97,
        essentiality: "non_essential",
        requestUrl: "https://ads.example.test/pixel.js",
        runtimePhase: "pre_consent",
        vendor: "Example Ads"
      }
    ],
    preconsent_tracking_detected: true
  };

  assert.equal(hasStrongPreconsentRuntimeEvidence(advertisingEvidence), true);
});

test("generic consent-surface timing satisfies sequence without requiring CMP identity", () => {
  const evidence = {
    consentActionableChoiceObserved: true,
    consentSurfaceObserved: true,
    consentTimeline: {
      firstCmpVisibleMs: null,
      firstConsentSurfaceVisibleMs: 900,
      firstNonEssentialRequestMs: 120
    },
    requestPurposeClassificationConfidence: [
      {
        category: "analytics",
        classification: "tracking",
        confidence: 0.92,
        essentiality: "non_essential",
        requestUrl: "https://analytics.example.test/collect",
        runtimePhase: "pre_consent",
        vendor: "Example Analytics"
      }
    ]
  };

  assert.equal(hasPreconsentSequenceEvidence(evidence), true);
  assert.equal(hasStrongPreconsentRuntimeEvidence(evidence), true);
});

test("complete no-surface inspection satisfies sequence without CMP or consent controls", () => {
  const evidence = {
    consentSurfaceInspection: {
      outcome: "no_surface_observed_complete_coverage",
      coverageStatus: "complete",
      inspectionCompleted: true,
      inspectedPreInteraction: true,
      observedAtMs: 240
    },
    consentTimeline: {
      firstCmpVisibleMs: null,
      firstConsentSurfaceVisibleMs: null,
      firstNonEssentialRequestMs: 120
    },
    requestPurposeClassificationConfidence: [{
      category: "analytics",
      classification: "tracking",
      confidence: 0.92,
      essentiality: "non_essential",
      requestUrl: "https://analytics.example.test/collect",
      runtimePhase: "pre_consent",
      vendor: "Example Analytics"
    }]
  };

  assert.equal(hasPreconsentSequenceEvidence(evidence), true);
  assert.equal(hasStrongPreconsentRuntimeEvidence(evidence), true);
});

test("no-surface inspection before the qualifying request does not satisfy sequence", () => {
  const evidence = {
    consentSurfaceInspection: {
      outcome: "no_surface_observed_complete_coverage",
      coverageStatus: "complete",
      inspectionCompleted: true,
      inspectedPreInteraction: true,
      observedAtMs: 100
    },
    consentTimeline: {
      firstConsentSurfaceVisibleMs: null,
      firstNonEssentialRequestMs: 120
    },
    requestPurposeClassificationConfidence: [{
      category: "advertising",
      confidence: 0.95,
      essentiality: "non_essential",
      requestUrl: "https://ads.example/pixel",
      runtimePhase: "pre_consent",
      tsMs: 120,
      vendor: "Example Ads"
    }]
  };

  assert.equal(hasPreconsentSequenceEvidence(evidence), false);
  assert.equal(hasStrongPreconsentRuntimeEvidence(evidence), false);
});

test("sensitive third-party tracking contract accepts legacy tracking-host payloads without promoting generic first-party runtime calls", () => {
  assert.equal(
    hasConcreteSensitiveThirdPartyTrackingArtifact({
      sensitive_payload_violations: [
        {
          detectedType: "phone_detected",
          evidenceStrength: "confirmed",
          matchSnippet: "intellimizeClientIp=***-***-4248",
          requestUrl: "https://log.intellimize.co/logger",
          vendorHost: "log.intellimize.co"
        }
      ]
    }),
    true
  );

  assert.equal(
    hasConcreteSensitiveThirdPartyTrackingArtifact({
      sensitive_payload_violations: [
        {
          detectedType: "postal_code_detected",
          evidenceStrength: "suspected",
          matchSnippet: "zipcode=64***18",
          requestUrl: "https://api.target.com/location_fulfillment_aggregations/v1/preferred_stores?zipcode=64118",
          vendorHost: "api.target.com"
        }
      ]
    }),
    false
  );
});

test("sensitive session replay contract accepts legacy replay-host payloads without promoting generic tracking hosts", () => {
  assert.equal(
    hasConcreteSensitiveSessionReplayArtifact({
      sensitive_payload_violations: [
        {
          detectedType: "email_detected",
          evidenceStrength: "confirmed",
          matchSnippet: "email=***@example.com",
          requestUrl: "https://clarity.ms/collect",
          vendorHost: "clarity.ms"
        }
      ]
    }),
    true
  );

  assert.equal(
    hasConcreteSensitiveSessionReplayArtifact({
      sensitive_payload_violations: [
        {
          detectedType: "phone_detected",
          evidenceStrength: "confirmed",
          matchSnippet: "intellimizeClientIp=***-***-4248",
          requestUrl: "https://log.intellimize.co/logger",
          vendorHost: "log.intellimize.co"
        }
      ]
    }),
    false
  );
});

test("sensitive replay surface co-occurrence requires a replay-correlated sensitive artifact", () => {
  assert.equal(
    hasSensitiveSessionReplaySurfaceCooccurrenceArtifact({
      sensitive_payload_violations: [
        {
          detectedType: "email_detected",
          evidenceSource: "sensitive_field_third_party_tracking_correlation",
          evidenceStrength: "form_field_signal",
          matchSnippet: "email field",
          requestUrl: "https://www.googletagmanager.com/gtm.js?id=GTM-TEST",
          vendorHost: "www.googletagmanager.com"
        }
      ],
      session_replay_runtime_detected: true,
      session_replay_runtime_vendors: ["Microsoft Clarity"]
    }),
    false
  );

  assert.equal(
    hasSensitiveSessionReplaySurfaceCooccurrenceArtifact({
      sensitive_payload_violations: [
        {
          detectedType: "email_detected",
          evidenceSource: "sensitive_field_session_replay_correlation",
          evidenceStrength: "form_field_signal",
          matchSnippet: "email field",
          requestUrl: "https://k.clarity.ms/collect",
          vendorHost: "k.clarity.ms"
        }
      ],
      session_replay_runtime_detected: true,
      session_replay_runtime_vendors: ["Microsoft Clarity"]
    }),
    true
  );
});

test("pre-consent cookie diagnostics distinguish collection, classification, phase, and contract suppression", () => {
  assert.equal(diagnosePreConsentCookieEvidence({}), "no_cookies_observed");
  assert.equal(
    diagnosePreConsentCookieEvidence({
      consent_baseline_cookie_count: 8
    }),
    "cookies_observed_not_classified"
  );
  assert.equal(
    diagnosePreConsentCookieEvidence({
      consent_baseline_cookie_count: 8,
      preconsent_cookie_names: ["_ga"]
    }),
    "cookies_observed_without_preconsent_phase"
  );
  assert.equal(
    diagnosePreConsentCookieEvidence({
      consentTimeline: { firstCmpVisibleMs: 0 },
      preconsent_cookie_categories: ["necessary"],
      preconsent_cookie_names: ["__cf_bm"]
    }),
    "preconsent_cookies_suppressed_by_contract"
  );
  assert.equal(
    diagnosePreConsentCookieEvidence({
      consentTimeline: { firstCmpVisibleMs: 0 },
      preconsent_cookie_categories: ["advertising"],
      preconsent_cookie_names: ["_fbp"]
    }),
    "preconsent_cookie_evidence_retained"
  );
});

test("fingerprinting primitive clusters require retained runtime anchors", () => {
  const summaryOnlyEvidence = {
    fingerprintSummary: {
      attributeCategories: [{ name: "canvas_webgl" }, { name: "audio" }, { name: "fonts_plugins" }],
      networkAfterCollection: true,
      thirdPartyAfterCollection: true,
      tier: 3
    }
  };

  assert.equal(hasStrongFingerprintingEvidence(summaryOnlyEvidence), false);
  assert.equal(
    hasStrongFingerprintingEvidence({
      ...summaryOnlyEvidence,
      fingerprintingRuntimeEvidence: [
        {
          artifactRef: "runtime:fingerprint:canvas:petdesk",
          attributeCategories: ["canvas_webgl", "audio", "fonts_plugins"],
          sourceScriptUrl: "https://cdn.example.test/fp.js"
        }
      ]
    }),
    true
  );
});

test("promotion contracts consume normalized compact evidence rows from concern entities", () => {
  const preconsentCookieRow = {
    category: "advertising",
    cookieName: "_fbp",
    nonEssential: true,
    party: "third_party",
    timingEvidence: "before_consent_cookie_write"
  };
  const rtbRow = {
    hostname: "px.ads.linkedin.com",
    pathSample: "/collect",
    queryKeysSample: ["partner", "redirect"],
    reason: "redirect_sync"
  };
  const crossDomainRow = {
    destinationClassification: "identity_graph",
    destinationDomain: "id5-sync.com",
    destinationEtldPlusOne: "id5-sync.com",
    identifierClass: "cookie_id",
    key: "uid",
    requestUrlRedacted: "https://id5-sync.com/sync?uid=[redacted]",
    sourcePageUrl: "https://petdesk.com/",
    valueHash: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
  };

  const normalizedConcernEvidence = {
    consentTimeline: {
      firstConsentActionMs: 1200,
      firstNonEssentialRequestMs: 200
    },
    entities: {
      cross_domain_identifier_sharing_destination_categories: ["identity_graph"],
      cross_domain_identifier_sharing_destination_etlds: ["id5-sync.com"],
      cross_domain_identifier_sharing_evidence: [JSON.stringify(crossDomainRow)],
      preconsent_cookie_evidence: [JSON.stringify(preconsentCookieRow)],
      rtbCookieSyncEvidence: [JSON.stringify(rtbRow)]
    }
  };

  assert.equal(hasConcretePreconsentArtifact(normalizedConcernEvidence), true);
  assert.equal(hasPreconsentSequenceEvidence(normalizedConcernEvidence), true);
  assert.equal(hasStrongPreconsentRuntimeEvidence(normalizedConcernEvidence), true);
  assert.equal(hasConcreteRtbCookieSyncEvidence(normalizedConcernEvidence), true);
  assert.equal(hasConcreteCrossDomainIdentifierSharingEvidence(normalizedConcernEvidence), true);
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

test("fingerprint tiering keeps generic modern web app telemetry at tier 0 or 1", () => {
  const tier = deriveFingerprintEvidenceTier({
    fingerprintAttributeCategories: ["screen_viewport", "timezone_locale", "storage", "input_touch"]
  });

  assert.ok(tier.tier <= 1);
  assert.equal(tier.entropyTransmissionObserved, false);
  assert.equal(tier.entropyLinkedToIdentifier, false);
});

test("fingerprint tiering keeps fraud-prevention-heavy fintech below tier 3 without identifier linkage", () => {
  const tier = deriveFingerprintEvidenceTier({
    fingerprintAttributeCategories: ["canvas_webgl", "audio", "hardware", "device_memory"],
    fingerprintRuntimeEvidence: [
      {
        artifactRef: "scan_runtime_artifacts.hybrid_runtime_evidence.fingerprintSummary",
        attributeCategories: ["canvas_webgl", "audio", "hardware", "device_memory"],
        tier: 2
      }
    ],
    runtimeVendors: ["Generic Risk Analytics"]
  });

  assert.equal(tier.tier, 2);
  assert.equal(hasStrongFingerprintingEvidence({
    fingerprintAttributeCategories: ["canvas_webgl", "audio", "hardware", "device_memory"],
    fingerprintRuntimeEvidence: [{ artifactRef: "scan_runtime_artifacts.hybrid_runtime_evidence.fingerprintSummary" }],
    runtimeVendors: ["Generic Risk Analytics"]
  }), false);
});

test("fingerprint tiering escalates adtech-heavy known fingerprint behavior to tier 3", () => {
  const evidence = {
    fingerprintAttributeCategories: ["canvas_webgl", "fonts_plugins"],
    fingerprintRuntimeEvidence: [
      {
        artifactRef: "scan_runtime_artifacts.hybrid_runtime_evidence.fingerprintSummary",
        attributeCategories: ["canvas_webgl", "fonts_plugins"],
        requestUrl: "https://fpjs.example.test/collect",
        tier: 3,
        vendor: "FingerprintJS"
      }
    ],
    runtimeVendors: ["FingerprintJS"]
  };
  const tier = deriveFingerprintEvidenceTier(evidence);

  assert.equal(tier.tier, 3);
  assert.equal(tier.knownFingerprintingVendorObserved, true);
  assert.equal(hasStrongFingerprintingEvidence(evidence), true);
});

test("fingerprint tiering keeps canvas-only telemetry below tier 3", () => {
  const tier = deriveFingerprintEvidenceTier({
    fingerprintAttributeCategories: ["canvas_webgl"],
    fingerprintSummary: { tier: 1 }
  });

  assert.equal(tier.tier, 1);
});

test("fingerprint tiering escalates canvas and fonts with outbound identifier sync to tier 3", () => {
  const evidence = {
    entropyLinkedToIdentifier: true,
    entropyTransmissionObserved: true,
    fingerprintAttributeCategories: ["canvas_webgl", "fonts_plugins"],
    fingerprintRuntimeEvidence: [
      {
        artifactRef: "scan_runtime_artifacts.hybrid_runtime_evidence.fingerprintSummary",
        attributeCategories: ["canvas_webgl", "fonts_plugins"],
        entropyLinkedToIdentifier: true,
        requestUrl: "https://ads.example.test/sync?device_fingerprint=abc&uid=123",
        tier: 3
      }
    ],
    requestUrls: ["https://ads.example.test/sync?device_fingerprint=abc&uid=123"]
  };
  const tier = deriveFingerprintEvidenceTier(evidence);

  assert.equal(tier.tier, 3);
  assert.equal(tier.entropyLinkedToIdentifier, true);
  assert.equal(tier.entropyTransmissionObserved, true);
  assert.equal(hasStrongFingerprintingEvidence(evidence), true);
});
