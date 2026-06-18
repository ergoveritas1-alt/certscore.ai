import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateFindingEvidenceContractForPacket,
  evaluateFindingEvidenceContractForRawEvidence,
  FINDING_EVIDENCE_CONTRACTS
} from "./finding-evidence-contracts";

const consentTimeline = {
  firstNonEssentialRequestMs: 100,
  firstCmpVisibleMs: 500,
  firstConsentActionMs: 800
};

const nonEssentialRequest = {
  confidence: 0.92,
  essentiality: "non_essential",
  requestUrl: "https://analytics.example.net/pixel.js"
};

const rtbEvidence = {
  hostname: "sync-t1.taboola.com",
  pathSample: "/sg/pubmatic-network/1/rtb-h/",
  queryKeysSample: ["gdpr", "uid"],
  reason: "sync_path",
  urlSample: "https://sync-t1.taboola.com/sg/pubmatic-network/1/rtb-h/?uid=abc"
};

test("registry defines contracts for the high-risk finding set", () => {
  assert.deepEqual(
    FINDING_EVIDENCE_CONTRACTS.map((contract) => contract.findingId).sort(),
    [
      "analytics_cookies_before_consent",
      "cookie_disclosure_gap",
      "cross_domain_identifier_sharing_observed",
	      "dark_pattern_consent_signals_detected",
	      "fingerprinting_observed",
      "forced_consent_interaction",
      "long_lived_cookie_retention_review",
	      "non_essential_tracking_continued_after_reject",
	      "policy_behavior_contradiction_detected",
	      "pre_consent_tracking_detected",
      "reject_option_missing_or_hidden",
      "rtb_cookie_sync_observed",
      "sensitive_data_collection_with_third_party_tracking_present",
      "session_replay_present_with_sensitive_surfaces_observed",
      "possible_session_replay_on_sensitive_input_surface",
      "session_replay_undisclosed",
      "third_party_tracking_before_consent",
      "tracking_cookies_set_before_consent",
      "video_content_tracking_exposure"
    ].sort()
	  );
	});

function makePolicyBehaviorContradictionEvidence(overrides: Record<string, unknown> = {}) {
  return {
    contradictionEvidence: {
      claim: "We use optional analytics and advertising cookies only after you set cookie preferences or consent.",
      contradictionBasis:
        "The policy says optional tracking is controlled by consent, but marketing requests fired before consent.",
      conflictBridge: {
        conflictType: "declared_cookie_choices_available_but_non_essential_tracking_fired_pre_choice",
        provenance: {
          bridgeRuleId: "test.policy_behavior_cookie_preferences_preconsent_v1",
          generatedBy: "wc01.test",
          mappingType: "deterministic_policy_runtime_mapping",
          mappingVersion: "policy_behavior_conflict_map:v1",
          policyAnchorRef: "policy:privacy#cookies",
          runtimeAnchorRef: "request:https://ads.example.net/pixel.js",
          sourceEvidenceIds: ["policy:privacy#cookies", "request:https://ads.example.net/pixel.js"]
        },
        reasoning:
          "The policy anchor describes cookie preferences for optional tracking while runtime evidence shows an advertising request before consent.",
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
        confidence: 0.82,
        extractionStatus: "fetched",
        normalizedClaim: "Optional analytics and advertising cookies are controlled by consent preferences.",
        snippet: "We use optional analytics and advertising cookies only after you set cookie preferences or consent.",
        sourceUrl: "https://example.com/privacy"
      },
      runtimeAnchor: {
        confidence: 0.88,
        observationType: "marketing_vendor_fired_pre_consent",
        phase: "pre_consent",
        requests: ["https://ads.example.net/pixel.js"],
        vendors: ["Example Ads"]
      },
      runtimeEvidenceArtifacts: ["https://ads.example.net/pixel.js"],
      runtimeVendors: ["Example Ads"],
      sourceUrls: ["https://example.com/privacy"]
    },
    ...overrides
  };
}

function makeUpstreamContradictionCandidatePackets(overrides: Record<string, unknown> = {}) {
  return {
    policyClaimCandidates: [
      {
        charEnd: 132,
        charStart: 14,
        claimType: "cookie_preferences_available",
        confidence: 0.84,
        documentType: "cookie_policy",
        extractedBy: "ws01.policy_claim_extractor",
        extractionStatus: "fetched",
        extractionVersion: "policy_claim_candidate:v1",
        headingPath: "Cookie Policy > Your choices",
        id: "policy_claim:cookie_preferences_available:example",
        sectionPath: "cookie-policy/your-choices",
        snippet:
          "You can manage cookie preferences and choose whether analytics and advertising cookies are enabled before they are used.",
        snippetHash: "sha256:policy-snippet-example",
        sourceUrl: "https://example.com/cookie-policy"
      }
    ],
    policyRuntimeBridgeCandidates: [
      {
        bridgeRuleId: "ws01.policy_runtime.cookie_preferences_preconsent_request_v1",
        confidence: 0.79,
        generatedBy: "ws01.policy_runtime_bridge_generator",
        id: "policy_runtime_bridge:example",
        mappingType: "deterministic_policy_runtime_mapping",
        mappingVersion: "policy_behavior_conflict_map:v1",
        policyAnchorRef: "policy_claim:cookie_preferences_available:example",
        reasoning:
          "The policy claim says analytics and advertising cookies are controlled by preferences, while the runtime artifact records a pre-consent advertising request.",
        runtimeAnchorRef: "runtime_artifact:request:pre_consent:example",
        sourceEvidenceIds: [
          "policy_claim:cookie_preferences_available:example",
          "runtime_artifact:request:pre_consent:example"
        ],
        supportsPromotionCandidate: true
      }
    ],
    runtimeBehaviorArtifacts: [
      {
        artifactType: "request",
        cmpVisibleMs: 450,
        confidence: 0.9,
        consentActionObserved: false,
        cookieName: null,
        host: "securepubads.g.doubleclick.net",
        id: "runtime_artifact:request:pre_consent:example",
        phase: "pre_consent",
        sourceArtifactRef: "network-request:securepubads.g.doubleclick.net/tag/js/gpt.js",
        storageKey: null,
        timestampMs: 120,
        url: "https://securepubads.g.doubleclick.net/tag/js/gpt.js",
        vendor: "Google Ad Manager"
      }
    ],
    ...overrides
  };
}

test("policy behavior contradiction contract fails closed without required anchors and bridge provenance", () => {
  assert.equal(
    evaluateFindingEvidenceContractForRawEvidence("policy_behavior_conflict", {
      policy_behavior_conflict_detected: true
    })?.promotionEligibility,
    "internal_only"
  );
  assert.ok(
    evaluateFindingEvidenceContractForRawEvidence("policy_behavior_conflict", makePolicyBehaviorContradictionEvidence({
      contradictionEvidence: {
        ...makePolicyBehaviorContradictionEvidence().contradictionEvidence,
        policyAnchor: null
      }
    }))?.negativeEvidenceFlags.includes("missing_policy_side_evidence")
  );
  assert.ok(
    evaluateFindingEvidenceContractForRawEvidence("policy_behavior_conflict", makePolicyBehaviorContradictionEvidence({
      contradictionEvidence: {
        ...makePolicyBehaviorContradictionEvidence().contradictionEvidence,
        runtimeAnchor: { confidence: 0.88, observationType: null, phase: "unknown", requests: [], vendors: [] }
      }
    }))?.negativeEvidenceFlags.includes("missing_runtime_anchor")
  );
  assert.ok(
    evaluateFindingEvidenceContractForRawEvidence("policy_behavior_conflict", makePolicyBehaviorContradictionEvidence({
      contradictionEvidence: {
        ...makePolicyBehaviorContradictionEvidence().contradictionEvidence,
        conflictBridge: {
          conflictType: "declared_cookie_choices_available_but_non_essential_tracking_fired_pre_choice",
          reasoning: "Looks mismatched.",
          supportsPromotion: true
        }
      }
    }))?.negativeEvidenceFlags.includes("missing_bridge_provenance")
  );
});

test("upstream policy/runtime bridge candidate packets normalize into a passing contradiction bundle", () => {
  const decision = evaluateFindingEvidenceContractForRawEvidence(
    "policy_behavior_contradiction_detected",
    makeUpstreamContradictionCandidatePackets()
  );

  assert.equal(decision?.status, "pass_strong");
  assert.equal(decision?.promotionEligibility, "eligible");
});

test("upstream near-miss packets do not satisfy the contradiction contract", () => {
  const base = makeUpstreamContradictionCandidatePackets();
  const nearMisses = [
    {
      id: "broad boolean alone",
      expectedFlag: "missing_policy_side_evidence",
      evidence: { policy_behavior_conflict_detected: true }
    },
    {
      id: "policy page exists alone",
      expectedFlag: "missing_runtime_anchor",
      evidence: {
        policyClaimCandidates: base.policyClaimCandidates,
        privacy_policy_present: true
      }
    },
    {
      id: "vendor name alone",
      expectedFlag: "missing_policy_side_evidence",
      evidence: {
        runtimeBehaviorArtifacts: [
          {
            artifactType: "vendor",
            confidence: 0.9,
            consentActionObserved: false,
            id: "runtime_artifact:vendor:pre_consent:example",
            phase: "pre_consent",
            sourceArtifactRef: "vendor:Google Ad Manager",
            vendor: "Google Ad Manager"
          }
        ]
      }
    },
    {
      id: "bridge candidate without stable refs",
      expectedFlag: "missing_bridge_provenance",
      evidence: {
        ...base,
        policyRuntimeBridgeCandidates: [
          {
            ...base.policyRuntimeBridgeCandidates[0],
            policyAnchorRef: "",
            runtimeAnchorRef: "",
            sourceEvidenceIds: []
          }
        ]
      }
    }
  ];

  for (const nearMiss of nearMisses) {
    const decision = evaluateFindingEvidenceContractForRawEvidence("policy_behavior_contradiction_detected", nearMiss.evidence);
    assert.equal(decision?.promotionEligibility, "internal_only", nearMiss.id);
    assert.ok(decision?.negativeEvidenceFlags.includes(nearMiss.expectedFlag), nearMiss.id);
  }
});

test("policy behavior contradiction contract rejects boilerplate or fallback policy anchors", () => {
  for (const snippet of [
    "Privacy Policy",
    "Terms of Use",
    "Insufficient policy content fetched for semantic review."
  ]) {
    const evidence = makePolicyBehaviorContradictionEvidence();
    (evidence.contradictionEvidence.policyAnchor as Record<string, unknown>).snippet = snippet;
    const decision = evaluateFindingEvidenceContractForRawEvidence("policy_behavior_conflict", evidence);
    assert.equal(decision?.promotionEligibility, "internal_only");
    assert.ok(decision?.negativeEvidenceFlags.includes("boilerplate_policy_anchor"));
    assert.ok(decision?.negativeEvidenceFlags.includes("producer_claim_failed_revalidation"));
  }
});

test("policy behavior contradiction contract passes a specific policy claim with runtime anchor and bridge provenance", () => {
  const decision = evaluateFindingEvidenceContractForRawEvidence(
    "consent_gated_tracking_claim_conflict",
    makePolicyBehaviorContradictionEvidence()
  );

  assert.equal(decision?.status, "pass_strong");
  assert.equal(decision?.promotionEligibility, "eligible");
});

test("policy behavior contradiction contract accepts multiple contradiction-grade positive fixtures", () => {
  const positives = [
    {
      id: "cookie preferences control optional advertising",
      evidence: makePolicyBehaviorContradictionEvidence()
    },
    {
      id: "only necessary cookies before choice but analytics fires",
      evidence: makePolicyBehaviorContradictionEvidence({
        contradictionEvidence: {
          ...makePolicyBehaviorContradictionEvidence().contradictionEvidence,
          claim: "We use only strictly necessary cookies before you make a choice; analytics cookies are used only after you consent.",
          conflictBridge: {
            conflictType: "declared_only_necessary_cookies_before_choice_but_non_essential_tracking_fired",
            provenance: {
              bridgeRuleId: "test.only_necessary_prechoice_analytics_v1",
              generatedBy: "wc01.test",
              mappingType: "deterministic_policy_runtime_mapping",
              mappingVersion: "policy_behavior_conflict_map:v1",
              policyAnchorRef: "policy:cookie#strictly-necessary",
              runtimeAnchorRef: "request:https://analytics.example.net/collect",
              sourceEvidenceIds: ["policy:cookie#strictly-necessary", "request:https://analytics.example.net/collect"]
            },
            reasoning:
              "The policy anchor limits pre-choice cookies to strictly necessary cookies, but analytics network evidence fired before consent.",
            supportsPromotion: true
          },
          policyAnchor: {
            claimType: "only_necessary_cookies_before_choice",
            confidence: 0.86,
            extractionStatus: "fetched",
            normalizedClaim: "Only strictly necessary cookies are used before consent; analytics requires consent.",
            snippet:
              "We use only strictly necessary cookies before you make a choice; analytics cookies are used only after you consent.",
            sourceUrl: "https://example.com/cookie-policy"
          },
          runtimeAnchor: {
            confidence: 0.91,
            observationType: "analytics_vendor_fired_pre_consent",
            phase: "pre_consent",
            requests: ["https://analytics.example.net/collect"],
            vendors: ["Example Analytics"]
          },
          runtimeEvidenceArtifacts: ["https://analytics.example.net/collect"],
          runtimeVendors: ["Example Analytics"],
          sourceUrls: ["https://example.com/cookie-policy"]
        }
      })
    },
    {
      id: "reject disables tracking but tracking persists",
      evidence: makePolicyBehaviorContradictionEvidence({
        contradictionEvidence: {
          ...makePolicyBehaviorContradictionEvidence().contradictionEvidence,
          claim: "If you reject optional cookies, we disable analytics and advertising tracking and store only necessary cookies.",
          conflictBridge: {
            conflictType: "declared_tracking_disabled_after_reject_but_tracking_persisted_after_reject",
            provenance: {
              bridgeRuleId: "test.reject_disables_tracking_v1",
              generatedBy: "wc01.test",
              mappingType: "deterministic_policy_runtime_mapping",
              mappingVersion: "policy_behavior_conflict_map:v1",
              policyAnchorRef: "policy:cookie#reject",
              runtimeAnchorRef: "cookie:_ga",
              sourceEvidenceIds: ["policy:cookie#reject", "cookie:_ga", "request:https://www.google-analytics.com/g/collect"]
            },
            reasoning:
              "The policy anchor says rejecting optional cookies disables tracking, but analytics tracking persisted after the reject action.",
            supportsPromotion: true
          },
          policyAnchor: {
            claimType: "tracking_disabled_after_reject",
            confidence: 0.84,
            extractionStatus: "fetched",
            normalizedClaim: "Rejecting optional cookies disables analytics and advertising tracking.",
            snippet:
              "If you reject optional cookies, we disable analytics and advertising tracking and store only necessary cookies.",
            sourceUrl: "https://example.com/privacy#cookies"
          },
          runtimeAnchor: {
            confidence: 0.89,
            observationType: "tracking_persisted_after_reject",
            phase: "after_reject",
            cookies: ["_ga"],
            requests: ["https://www.google-analytics.com/g/collect"],
            vendors: ["Google Analytics"]
          },
          runtimeEvidenceArtifacts: ["cookie:_ga", "https://www.google-analytics.com/g/collect"],
          runtimeVendors: ["Google Analytics"],
          sourceUrls: ["https://example.com/privacy#cookies"]
        }
      })
    }
  ];

  for (const positive of positives) {
    const decision = evaluateFindingEvidenceContractForRawEvidence("policy_behavior_contradiction_detected", positive.evidence);
    assert.equal(decision?.status, "pass_strong", positive.id);
    assert.equal(decision?.promotionEligibility, "eligible", positive.id);
  }
});

test("policy behavior contradiction contract keeps near-miss fixtures blocked", () => {
  const base = makePolicyBehaviorContradictionEvidence().contradictionEvidence;
  const nearMisses = [
    {
      id: "valid runtime evidence but weak policy claim",
      expectedFlag: "weak_policy_anchor",
      evidence: makePolicyBehaviorContradictionEvidence({
        contradictionEvidence: {
          ...base,
          policyAnchor: {
            ...base.policyAnchor,
            snippet: "Privacy choices and legal information for visitors."
          }
        }
      })
    },
    {
      id: "generic cookie explanation but no consent or preference claim",
      expectedFlag: "weak_policy_anchor",
      evidence: makePolicyBehaviorContradictionEvidence({
        contradictionEvidence: {
          ...base,
          policyAnchor: {
            ...base.policyAnchor,
            snippet:
              "Cookie Policy To make our website useful and reliable, we need to place small amounts of information called cookies on your device. Cookies do lots of different jobs, like letting you navigate pages."
          }
        }
      })
    },
    {
      id: "valid policy claim but no concrete runtime artifact",
      expectedFlag: "missing_specific_runtime_artifact",
      evidence: makePolicyBehaviorContradictionEvidence({
        contradictionEvidence: {
          ...base,
          runtimeAnchor: {
            confidence: 0.88,
            observationType: "marketing_vendor_fired_pre_consent",
            phase: "pre_consent",
            requests: [],
            vendors: [],
            cookies: [],
            storageArtifacts: []
          },
          runtimeEvidenceArtifacts: [],
          runtimeVendors: []
        }
      })
    },
    {
      id: "policy and runtime present but no bridge provenance",
      expectedFlag: "missing_bridge_provenance",
      evidence: makePolicyBehaviorContradictionEvidence({
        contradictionEvidence: {
          ...base,
          conflictBridge: {
            conflictType: "declared_cookie_choices_available_but_non_essential_tracking_fired_pre_choice",
            reasoning:
              "The policy anchor describes cookie preferences for optional tracking while runtime evidence shows an advertising request before consent.",
            supportsPromotion: true
          }
        }
      })
    }
  ];

  for (const nearMiss of nearMisses) {
    const decision = evaluateFindingEvidenceContractForRawEvidence("policy_behavior_contradiction_detected", nearMiss.evidence);
    assert.equal(decision?.promotionEligibility, "internal_only", nearMiss.id);
    assert.ok(decision?.negativeEvidenceFlags.includes(nearMiss.expectedFlag), nearMiss.id);
  }
});

test("raw snapshot boolean cannot satisfy a strong pre-consent contract", () => {
  const decision = evaluateFindingEvidenceContractForRawEvidence("preconsent_tracking", {
    trackingBeforeConsentDetected: true,
    preconsent_tracking_detected: true
  });

  assert.equal(decision?.status, "downgrade");
  assert.equal(decision?.promotionEligibility, "internal_only");
  assert.ok(decision?.missingRequirements.includes("consentTimelineSequence"));
});

test("pre-consent without consentTimeline is downgraded", () => {
  const decision = evaluateFindingEvidenceContractForRawEvidence("preconsent_tracking", {
    requestPurposeClassificationConfidence: [nonEssentialRequest],
    runtimeRequestUrls: [nonEssentialRequest.requestUrl]
  });

  assert.equal(decision?.status, "downgrade");
  assert.ok(decision?.missingRequirements.includes("consentTimelineSequence"));
});

test("pre-consent with timeline but unknown essentiality is downgraded", () => {
  const decision = evaluateFindingEvidenceContractForRawEvidence("preconsent_tracking", {
    consentTimeline,
    requestPurposeClassificationConfidence: [
      {
        confidence: 0.35,
        essentiality: "unknown",
        requestUrl: "https://www.googletagmanager.com/gtm.js"
      }
    ],
    runtimeRequestUrls: ["https://www.googletagmanager.com/gtm.js"]
  });

  assert.equal(decision?.status, "downgrade");
  assert.ok(decision?.missingRequirements.includes("nonEssentialRequestClassification"));
});

test("pre-consent with timeline and non-essential classification satisfies strong", () => {
  const decision = evaluateFindingEvidenceContractForRawEvidence("preconsent_tracking", {
    consentTimeline,
    requestPurposeClassificationConfidence: [nonEssentialRequest],
    runtimeRequestUrls: [nonEssentialRequest.requestUrl]
  });

  assert.equal(decision?.status, "pass_strong");
  assert.equal(decision?.allowedNarrativeTier, "strong");
});

test("legacy sequenceEvidence shorthand does not satisfy strong pre-consent evidence", () => {
  const decision = evaluateFindingEvidenceContractForRawEvidence("preconsent_tracking", {
    requestPurposeClassificationConfidence: [nonEssentialRequest],
    runtimeRequestUrls: [nonEssentialRequest.requestUrl],
    sequenceEvidence: true
  });

  assert.equal(decision?.status, "downgrade");
  assert.ok(decision?.missingRequirements.includes("consentTimelineSequence"));
});

test("WS01-style pre-consent timeline and first tracking request evidence satisfies strong", () => {
  const decision = evaluateFindingEvidenceContractForRawEvidence("preconsent_tracking", {
    consent_timeline: {
      first_cmp_visible_ms: 650,
      first_consent_action_ms: 1200,
      first_non_essential_request_ms: 180,
      first_tracking_cookie_seen_ms: 220
    },
    request_purpose_classification_confidence: [
      {
        confidence: 0.91,
        essentiality: "non_essential",
        requestUrl: "https://www.googletagmanager.com/gtm.js"
      }
    ],
    runtime_request_urls: ["https://www.googletagmanager.com/gtm.js"],
    runtime_vendors: ["Google Tag Manager"]
  });

  assert.equal(decision?.status, "pass_strong");
  assert.equal(decision?.allowedNarrativeTier, "strong");
});

test("WS01-style cookie write timing evidence satisfies cookie pre-consent strong", () => {
  const decision = evaluateFindingEvidenceContractForRawEvidence("tracking_cookies_set_before_consent", {
    consent_timeline: {
      first_cmp_visible_ms: 700,
      first_consent_action_ms: 1300,
      first_non_essential_request_ms: 210,
      first_tracking_cookie_seen_ms: 240
    },
    preconsent_cookie_categories: ["advertising"],
    preconsent_cookie_names: ["_fbp"],
    preconsent_nonessential_cookie_names: ["_fbp"],
    runtime_cookie_names: ["_fbp"]
  });

  assert.equal(decision?.status, "pass_strong");
});

test("WS01-style first-party analytics cookie snapshot evidence satisfies analytics pre-consent strong", () => {
  const decision = evaluateFindingEvidenceContractForRawEvidence("analytics_cookies_before_consent", {
    consent_timeline: {
      first_cmp_visible_ms: 0,
      first_consent_action_ms: null,
      first_tracking_cookie_seen_ms: null
    },
    consentActionableChoiceObserved: true,
    consentSurfaceObserved: true,
    preconsent_cookie_categories: ["analytics"],
    preconsent_cookie_evidence: [
      {
        beforeConsent: true,
        category: "analytics",
        cookieName: "_ga",
        domain: ".example.com",
        evidenceGrade: "moderate",
        initiatorVendor: "Google Analytics",
        party: "first_party",
        timingBasis: "initial_cookie_snapshot_with_visible_cmp",
        timingEvidence: "before_consent_cookie_write"
      }
    ],
    preconsent_cookie_names: ["_ga"],
    preconsent_cookie_timing_evidence: ["before_consent_cookie_write"]
  });

  assert.equal(decision?.status, "pass_strong");
});

test("post-reject tracking without successful reject interaction is downgraded", () => {
  const decision = evaluateFindingEvidenceContractForRawEvidence("reject_did_not_reduce_tracking", {
    postRejectNonEssentialRequestUrls: ["https://analytics.example.net/collect"],
    requestPurposeClassificationConfidence: [nonEssentialRequest]
  });

  assert.equal(decision?.status, "downgrade");
  assert.ok(decision?.missingRequirements.includes("successfulRejectInteraction"));
});

test("WS01-style reject action and post-reject tracking evidence satisfies strong", () => {
  const decision = evaluateFindingEvidenceContractForRawEvidence("reject_did_not_reduce_tracking", {
    post_reject_non_essential_requests: [
      {
        category: "advertising",
        ms_after_reject: 1500,
        ts_ms: 4600,
        url: "https://ads.example.net/collect",
        vendor: "Example Ads"
      }
    ],
    request_purpose_classification_confidence: [
      {
        confidence: 0.9,
        essentiality: "non_essential",
        requestUrl: "https://ads.example.net/collect"
      }
    ],
    reject_path_depth_and_availability: {
      availability: "available",
      banner_layer_inspected: true,
      reject_interaction_succeeded: true
    },
    reject_interaction_attribution: {
      clicked_label: "Reject all",
      final_url_host_changed: false
    }
  });

  assert.equal(decision?.status, "pass_strong");
});

test("WS01-style post-reject tag-manager request evidence satisfies strong", () => {
  const decision = evaluateFindingEvidenceContractForRawEvidence("reject_did_not_reduce_tracking", {
    post_reject_non_essential_requests: [
      {
        category: "tag_manager",
        ms_after_reject: 1500,
        ts_ms: 4600,
        url: "https://www.googletagmanager.com/gtm.js?id=GTM-POST-REJECT",
        vendor: "Google Tag Manager"
      }
    ],
    reject_path_depth_and_availability: {
      availability: "available",
      banner_layer_inspected: true,
      reject_interaction_succeeded: true
    },
    reject_interaction_attribution: {
      clicked_label: "Reject all",
      final_url_host_changed: false
    },
    suppression_checks: {
      post_reject_window_available: true,
      reject_click_confirmed: true
    }
  });

  assert.equal(decision?.status, "pass_strong");
});

test("stringified reject requestUrl packet evidence satisfies strong", () => {
  const decision = evaluateFindingEvidenceContractForPacket({
    confidenceInputs: {
      hasPolicyTextEvidence: false
    },
    concernContext: null,
    evidence: {
      entities: {
        postRejectNonEssentialRequests: [
          JSON.stringify({
            category: "advertising",
            ms_after_reject: 1500,
            requestUrl: "https://ads.example.net/collect",
            ts_ms: 4600,
            vendor: "Example Ads"
          })
        ],
        requestPurposeClassificationConfidence: [
          JSON.stringify({
            confidence: 0.9,
            essentiality: "non_essential",
            requestUrl: "https://ads.example.net/collect"
          })
        ],
        suppressionChecks: [
          JSON.stringify({
            post_reject_window_available: true,
            reject_click_confirmed: true
          })
        ],
        rejectInteractionAttribution: [
          JSON.stringify({
            clickedLabel: "Reject all",
            finalUrlHostChanged: false
          })
        ]
      },
      flags: ["reject_evidence_confirmed"]
    },
    unifiedFindingId: "reject_did_not_reduce_tracking"
  } as never);

  assert.equal(decision?.status, "pass_strong");
});

test("WS01-style reject cookie diff provenance stays audit-only without post-reject request timing", () => {
  const decision = evaluateFindingEvidenceContractForRawEvidence("reject_did_not_reduce_tracking", {
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
    rejectPathDepthAndAvailability: {
      rejectInteractionSucceeded: true
    },
    rejectInteractionAttribution: {
      clickedLabel: "Reject all",
      finalUrlHostChanged: false
    },
    suppressionChecks: {
      reject_click_confirmed: true
    }
  });

  assert.equal(decision?.status, "downgrade");
  assert.equal(decision?.allowedNarrativeTier, "weak");
  assert.equal(decision?.promotionEligibility, "internal_only");
  assert.ok(decision?.missingRequirements.includes("postRejectTimestampedRuntimeEvidence"));
});

test("article/content click labels do not satisfy successful reject interaction evidence", () => {
  const decision = evaluateFindingEvidenceContractForRawEvidence("reject_did_not_reduce_tracking", {
    postRejectNonEssentialRequests: [
      {
        category: "advertising",
        ms_after_reject: 1200,
        requestUrl: "https://ads.example.net/collect",
        ts_ms: 4600,
        vendor: "Example Ads"
      }
    ],
    rejectInteractionAttribution: {
      clickedLabel: "Even silent heart attacks could speed up cognitive decline",
      finalUrlHostChanged: false
    },
    rejectPathDepthAndAvailability: {
      rejectInteractionSucceeded: true
    },
    suppressionChecks: {
      post_reject_window_available: true,
      reject_click_confirmed: true
    }
  });

  assert.equal(decision?.status, "downgrade");
  assert.ok(decision?.missingRequirements.includes("successfulRejectInteraction"));
});

test("WS01 reject control attribution fields satisfy successful reject interaction evidence", () => {
  const decision = evaluateFindingEvidenceContractForRawEvidence("reject_did_not_reduce_tracking", {
    postRejectNonEssentialRequests: [
      {
        category: "advertising",
        ms_after_reject: 1200,
        requestUrl: "https://ads.example.net/collect",
        ts_ms: 4600,
        vendor: "Example Ads"
      }
    ],
    rejectInteractionAttribution: {
      consentSurfaceDetected: true,
      controlRole: "reject",
      controlSelector: "button#onetrust-reject-all-handler",
      controlSource: "cmp_button",
      controlText: "Reject all",
      finalUrlHostChanged: false
    },
    rejectPathDepthAndAvailability: {
      rejectInteractionSucceeded: true
    },
    suppressionChecks: {
      post_reject_window_available: true,
      reject_click_confirmed: true
    }
  });

  assert.equal(decision?.status, "pass_strong");
  assert.equal(decision?.promotionEligibility, "eligible");
});

test("reject hidden requires inspected banner and reject path evidence", () => {
  const weakDecision = evaluateFindingEvidenceContractForRawEvidence("reject_button_missing", {
    privacy_dark_pattern_reject_button_missing: true
  });
  const strongDecision = evaluateFindingEvidenceContractForRawEvidence("reject_button_missing", {
    consentSurfaceDecisionStates: ["consent_surface_observed", "reject_absent_first_layer"],
    consentSurfaceDiagnostics: {
      bannerRendered: true,
      hydrationSettleWaitMs: 1500,
      candidateButtons: [
        { label: "Accept all", visible: true, interactable: true },
        { label: "Manage choices", visible: true, interactable: true }
      ],
      viewportStatus: "visible_in_viewport"
    },
    consentSurfaceObserved: true,
    hybridConsentSummary: {
      acceptActionLabels: ["Accept all"],
      acceptPresent: true,
      bannerPresent: true,
      manageActionLabels: ["Manage choices"],
      managePresent: true,
      rejectActionLabels: [],
      rejectPresent: false
    },
    rejectPathDepthAndAvailability: {
      availability: "hidden",
      bannerLayerInspected: true,
      depth: 2,
      rejectInteractionSucceeded: false
    }
  });

  assert.equal(weakDecision?.status, "downgrade");
  assert.ok(weakDecision?.missingRequirements.includes("rejectPathDepthEvidence"));
  assert.equal(strongDecision?.status, "pass_strong");
});

test("reject and asymmetry findings require confirmed first-layer GDPR consent surface", () => {
  const rawEvidence = {
    consentSurfaceDecisionStates: ["consent_surface_observed", "reject_absent_first_layer"],
    consentSurfaceDiagnostics: {
      bannerRendered: true,
      candidateButtons: [
        { label: "Accept all", visible: true, interactable: true },
        { label: "Manage choices", visible: true, interactable: true }
      ],
      hydrationSettleWaitMs: 1500,
      viewportStatus: "visible_in_viewport"
    },
    consentSurfaceObserved: true,
    hybridConsentSummary: {
      acceptActionLabels: ["Accept all"],
      acceptPresent: true,
      bannerPresent: true,
      manageActionLabels: ["Manage choices"],
      rejectActionLabels: [],
      rejectPresent: false
    },
    rejectPathDepthAndAvailability: {
      bannerLayerInspected: true,
      choiceAsymmetry: "material",
      firstLayerCookieConsentBannerObserved: false,
      gdprEprivacyConsentSurfaceObserved: "unconfirmed",
      rejectAvailableOnFirstLayer: false
    }
  };

  const rejectDecision = evaluateFindingEvidenceContractForRawEvidence("reject_button_missing", rawEvidence);
  const asymmetryDecision = evaluateFindingEvidenceContractForRawEvidence("accept_more_prominent_than_reject", rawEvidence);

  assert.equal(rejectDecision?.status, "downgrade");
  assert.equal(rejectDecision?.promotionEligibility, "internal_only");
  assert.ok(rejectDecision?.missingRequirements.includes("consentSurfaceEvaluable"));
  assert.equal(asymmetryDecision?.status, "downgrade");
  assert.equal(asymmetryDecision?.promotionEligibility, "internal_only");
  assert.ok(asymmetryDecision?.missingRequirements.includes("consentSurfaceEvaluable"));
});

test("reject behind preferences path satisfies reject path evidence", () => {
  const decision = evaluateFindingEvidenceContractForRawEvidence("reject_button_missing", {
    consentSurfaceDecisionStates: ["consent_surface_observed", "reject_absent_first_layer"],
    consentSurfaceDiagnostics: {
      bannerRendered: true,
      hydrationSettleWaitMs: 1500,
      candidateButtons: [
        { label: "Accept all", visible: true, interactable: true },
        { label: "Manage choices", visible: true, interactable: true }
      ],
      viewportStatus: "visible_in_viewport"
    },
    consentSurfaceObserved: true,
    hybridConsentSummary: {
      acceptActionLabels: ["Accept all"],
      acceptPresent: true,
      bannerPresent: true,
      manageActionLabels: ["Manage choices"],
      managePresent: true,
      rejectActionLabels: [],
      rejectPresent: false
    },
    rejectPathDepthAndAvailability: {
      acceptClickDepth: 1,
      bannerLayerInspected: true,
      choiceAsymmetry: "material",
      preferencesRequiredBeforeReject: true,
      rejectAvailableOnFirstLayer: false,
      rejectClickDepth: 2
    }
  });

  assert.equal(decision?.status, "pass_strong");
});

test("retained complete-reject-path missing classification satisfies reject path evidence", () => {
  const decision = evaluateFindingEvidenceContractForRawEvidence("reject_button_missing", {
    consentSurfaceDecisionStates: ["consent_surface_observed", "reject_absent_first_layer"],
    consentSurfaceDiagnostics: {
      bannerRendered: true,
      hydrationSettleWaitMs: 1500,
      candidateButtons: [
        { label: "Accept all", visible: true, interactable: true },
        { label: "Cookie preferences", visible: true, interactable: true }
      ],
      viewportStatus: "visible_in_viewport"
    },
    consentSurfaceObserved: true,
    hybridConsentSummary: {
      acceptActionLabels: ["Accept all"],
      acceptPresent: true,
      bannerPresent: true,
      manageActionLabels: ["Cookie preferences"],
      managePresent: true,
      rejectActionLabels: [],
      rejectPresent: false
    },
    rejectPathDepthAndAvailability: {
      availability: "not_found",
      bannerLayerInspected: true,
      completeRejectPathAvailable: false,
      completeRejectPathDetected: false,
      negativeReasonCodes: ["complete_reject_choice_controls_not_detected"],
      rejectAvailableOnFirstLayer: false,
      rejectEquivalentFound: false,
      rejectPathAvailabilityClassification: "complete_reject_path_not_detected"
    }
  });

  assert.equal(decision?.status, "pass_strong");
});

test("retained reject path satisfies consent UX contracts without optional viewport diagnostics", () => {
  const rejectDecision = evaluateFindingEvidenceContractForRawEvidence("reject_button_missing", {
    consentSurfaceDecisionStates: ["consent_surface_observed", "reject_absent_first_layer"],
    consentSurfaceObserved: true,
    hybridConsentSummary: {
      acceptActionLabels: ["Accept all"],
      acceptPresent: true,
      bannerPresent: true,
      rejectActionLabels: [],
      rejectPresent: false
    },
    rejectPathDepthAndAvailability: {
      acceptClickDepth: 1,
      bannerLayerInspected: true,
      choiceAsymmetry: "material",
      rejectAvailableOnFirstLayer: false,
      rejectClickDepth: 2,
      status: "hidden"
    }
  });
  const darkPatternDecision = evaluateFindingEvidenceContractForRawEvidence("accept_only_banner", {
    accept_only_banner: true,
    consentSurfaceDecisionStates: ["consent_surface_observed", "reject_absent_first_layer"],
    consentSurfaceObserved: true,
    consentUiArtifactRefs: ["hybrid_runtime_evidence"],
    hybridConsentSummary: {
      acceptActionLabels: ["Accept all"],
      acceptPresent: true,
      bannerPresent: true,
      rejectActionLabels: [],
      rejectPresent: false
    },
    hybridConsentVisual: {
      acceptOnly: true
    },
    rejectPathDepthAndAvailability: {
      acceptClickDepth: 1,
      bannerLayerInspected: true,
      choiceAsymmetry: "material",
      rejectAvailableOnFirstLayer: false,
      rejectClickDepth: 2,
      status: "hidden"
    }
  });

  assert.equal(rejectDecision?.status, "pass_strong");
  assert.equal(darkPatternDecision?.status, "pass_strong");
});

test("dark-pattern consent signals require verified banner UI evidence", () => {
  const weakDecision = evaluateFindingEvidenceContractForRawEvidence("accept_only_banner", {
    accept_only_banner: true
  });
  const strongDecision = evaluateFindingEvidenceContractForRawEvidence("accept_only_banner", {
    accept_only_banner: true,
    consentSurfaceDecisionStates: ["consent_surface_observed", "reject_absent_first_layer"],
    consentSurfaceDiagnostics: {
      bannerRendered: true,
      hydrationSettleWaitMs: 1500,
      candidateButtons: [{ label: "Accept all", visible: true, interactable: true }],
      viewportStatus: "visible_in_viewport"
    },
    consentSurfaceObserved: true,
    consentUiArtifactRefs: ["hybrid_runtime_evidence"],
    hybridConsentSummary: {
      acceptActionLabels: ["Accept all"],
      acceptPresent: true,
      bannerPresent: true,
      managePresent: false,
      rejectPresent: false
    },
    hybridConsentVisual: {
      acceptOnly: true
    }
  });

  assert.equal(weakDecision?.status, "downgrade");
  assert.ok(weakDecision?.missingRequirements.includes("materialChoiceAsymmetryEvidence"));
  assert.equal(strongDecision?.status, "pass_strong");
});

test("non-consent overlays do not satisfy consent dark-pattern UI evidence by themselves", () => {
  const ageGateDecision = evaluateFindingEvidenceContractForRawEvidence("forced_consent_wall", {
    consentSurfaceObserved: true,
    consentUiArtifactRefs: ["hybrid_runtime_evidence"],
    forced_consent_wall: true,
    overlayKind: "age_gate",
    hybridConsentSummary: {
      bannerPresent: true,
      pageInteractionBlocked: true
    },
    hybridUiSummary: {
      forcedActionRequired: true
    }
  });
  const consentWallDecision = evaluateFindingEvidenceContractForRawEvidence("forced_consent_wall", {
    consentSurfaceDecisionStates: ["consent_surface_observed", "reject_absent_first_layer"],
    consentSurfaceDiagnostics: {
      bannerRendered: true,
      hydrationSettleWaitMs: 1500,
      candidateButtons: [
        { label: "Accept all", visible: true, interactable: true },
        { label: "Manage preferences", visible: true, interactable: true }
      ],
      viewportStatus: "visible_in_viewport"
    },
    consentSurfaceObserved: true,
    consentUiArtifactRefs: ["hybrid_runtime_evidence"],
    consentUiPathEvidence: {
      blockingEvidenceSource: "runtime_consent_ui_probe",
      pageInteractionBlocked: true,
      unrelatedOverlayClassifier: "consent_surface"
    },
    forced_consent_wall: true,
    overlayKind: "consent_overlay",
    hybridConsentSummary: {
      acceptActionLabels: ["Accept all"],
      bannerPresent: true,
      bannerTextSnippet: "We use cookies. Accept all or manage preferences.",
      manageActionLabels: ["Manage preferences"],
      rejectPresent: false,
      pageInteractionBlocked: true
    },
    hybridUiSummary: {
      forcedActionRequired: true
    }
  });

  assert.equal(ageGateDecision?.status, "downgrade");
  assert.ok(ageGateDecision?.missingRequirements.includes("consentSpecificBlockingInteraction"));
  assert.equal(consentWallDecision?.status, "pass_strong");
});

test("dark-pattern consent signals accept retained DOM labels without screenshot refs", () => {
  const noLabelDecision = evaluateFindingEvidenceContractForRawEvidence("accept_only_banner", {
    accept_only_banner: true,
    consentSurfaceObserved: true,
    hybridConsentSummary: {
      acceptPresent: true,
      bannerPresent: true,
      managePresent: false,
      rejectPresent: false
    },
    hybridConsentVisual: {
      acceptOnly: true
    }
  });
  const retainedLabelDecision = evaluateFindingEvidenceContractForRawEvidence("accept_only_banner", {
    accept_only_banner: true,
    consentSurfaceDecisionStates: ["consent_surface_observed", "reject_absent_first_layer"],
    consentSurfaceDiagnostics: {
      bannerRendered: true,
      hydrationSettleWaitMs: 1500,
      candidateButtons: [{ label: "accept all", visible: true, interactable: true }],
      viewportStatus: "visible_in_viewport"
    },
    consentSurfaceObserved: true,
    hybridConsentSummary: {
      acceptActionLabels: ["accept all"],
      bannerPresent: true,
      bannerTextSnippet: "We use cookies to improve your experience. Accept all",
      manageActionLabels: [],
      rejectActionLabels: []
    },
    hybridConsentVisual: {
      acceptOnly: true
    },
    runtimeEvidenceArtifacts: ["hybrid_runtime_evidence"]
  });

  assert.equal(noLabelDecision?.status, "downgrade");
  assert.ok(noLabelDecision?.missingRequirements.includes("materialChoiceAsymmetryEvidence"));
  assert.equal(retainedLabelDecision?.status, "pass_strong");
});

test("cookie disclosure gap without policy anchor is not promoted", () => {
  const decision = evaluateFindingEvidenceContractForRawEvidence("cookie_disclosure_gap", {
    runtime_cookie_names: ["_ga"],
    unmatched_cookie_categories: ["analytics"]
  });

  assert.equal(decision?.status, "downgrade");
  assert.ok(decision?.missingRequirements.includes("policyAnchor"));
});

test("cookie disclosure gap without mismatch bridge stays audit-only", () => {
  const decision = evaluateFindingEvidenceContractForRawEvidence("cookie_disclosure_gap", {
    disclosureSearchScopeRetained: true,
    policyExtractionStatus: "fetched",
    policySourceUrl: "https://example.com/cookie-policy",
    runtime_cookie_categories: ["advertising"],
    runtime_cookie_names: ["_fbp"],
    unmatched_cookie_names: ["_fbp"]
  });

  assert.equal(decision?.status, "downgrade");
  assert.equal(decision?.promotionEligibility, "internal_only");
  assert.ok(decision?.missingRequirements.includes("conflictBridge"));
});

test("cookie disclosure gap suppressIf blocks ignored runtime cookie inventory", () => {
  const decision = evaluateFindingEvidenceContractForRawEvidence("cookie_disclosure_gap", {
    disclosureSearchScopeRetained: true,
    mismatchExplanation: "Only operational runtime cookies were unmatched.",
    observedBehavior: "Runtime cookies were observed.",
    policyExtractionStatus: "fetched",
    policySourceUrl: "https://example.com/cookie-policy",
    policySnippet: "Cookie policy text.",
    runtime_cookie_names: ["__cf_bm", "optanonconsent", "geo_country"],
    unmatched_cookie_names: ["__cf_bm", "optanonconsent"]
  });

  assert.equal(decision?.status, "suppress");
  assert.equal(decision?.externalSurfacingEligibility, "suppress");
  assert.ok(decision?.negativeEvidenceFlags.includes("runtime_cookie_inventory_ignored_only"));
});

test("WS01-style cookie disclosure evidence satisfies strong", () => {
  const decision = evaluateFindingEvidenceContractForRawEvidence("cookie_disclosure_gap", {
    disclosure_search_scope_retained: true,
    mismatch_explanation: "Runtime cookie _fbp was not present in retained cookie disclosure text.",
    observedBehavior: "Runtime set _fbp from Meta Pixel.",
    policy_extraction_status: "fetched",
    policy_source_url: "https://example.com/cookie-policy",
    policySnippet: "We use strictly necessary cookies.",
    runtime_cookie_categories: ["advertising"],
    runtime_cookie_names: ["_fbp"],
    runtime_vendors: ["Meta Pixel"],
    unmatched_cookie_names: ["_fbp"]
  });

  assert.equal(decision?.status, "pass_strong");
});

test("session replay undisclosed without negative disclosure search is downgraded", () => {
  const decision = evaluateFindingEvidenceContractForRawEvidence("session_replay_undisclosed", {
    policyExtractionStatus: "fetched",
    policySourceUrl: "https://example.com/privacy",
    sessionReplayVendors: ["Microsoft Clarity"]
  });

  assert.equal(decision?.status, "downgrade");
  assert.ok(decision?.missingRequirements.includes("negativeEvidenceSearchScope"));
});

test("long-lived cookie retention review requires concrete runtime cookie duration evidence", () => {
  const positive = evaluateFindingEvidenceContractForRawEvidence("cookie_retention_lifetime_review_signal", {
    cookieRetentionEvidence: [
      {
        classification: "advertising/marketing",
        cookieName: "_fbp",
        domain: ".example.com",
        durationDays: 540,
        pageUrl: "https://example.com/",
        sourceRequestUrl: "https://connect.facebook.net/en_US/fbevents.js",
        thresholdBasis: "540 days observed against CertScore's 365-day cookie retention review threshold.",
        vendor: "Meta"
      }
    ]
  });
  assert.equal(positive?.externalSurfacingEligibility, "eligible");
  assert.equal(positive?.allowedNarrativeTier, "strong");

  const missingDuration = evaluateFindingEvidenceContractForRawEvidence("cookie_retention_lifetime_review_signal", {
    cookieRetentionEvidence: [
      {
        classification: "advertising/marketing",
        cookieName: "_fbp",
        domain: ".example.com",
        pageUrl: "https://example.com/",
        thresholdBasis: "Cookie name and domain retained without duration."
      }
    ]
  });
  assert.equal(missingDuration?.externalSurfacingEligibility, "audit_only");
  assert.ok(missingDuration?.negativeEvidenceFlags.includes("missing_cookie_duration"));
});

test("RTB observed can surface as runtime RTB but not strong pre-consent RTB without timeline", () => {
  const decision = evaluateFindingEvidenceContractForRawEvidence("rtb_cookie_sync_observed", {
    rtb_cookie_sync_evidence: [rtbEvidence]
  });

  assert.equal(decision?.status, "pass_good");
  assert.equal(decision?.allowedNarrativeTier, "moderate");
  assert.ok(decision?.missingRequirements.includes("consentTimelineSequence"));
});

test("RTB identifier-query evidence accepts named identity sync keys", () => {
  const decision = evaluateFindingEvidenceContractForRawEvidence("rtb_cookie_sync_observed", {
    rtb_cookie_sync_evidence: [
      {
        hostname: "id5-sync.com",
        path_sample: "/pixel.gif",
        query_keys_sample: ["uid2"],
        reason: "identifier_query"
      }
    ]
  });

  assert.equal(decision?.status, "pass_good");
});

test("RTB sync-path-only singleton is audit-only without retained identifier or redirect support", () => {
  const decision = evaluateFindingEvidenceContractForRawEvidence("rtb_cookie_sync_observed", {
    rtb_cookie_sync_evidence: [
      {
        hostname: "sync.example-adtech.test",
        path_sample: "/sync",
        reason: "sync_path"
      }
    ]
  });

  assert.equal(decision?.status, "downgrade");
  assert.equal(decision?.allowedNarrativeTier, "weak");
  assert.ok(decision?.missingRequirements.includes("rtbOrIdentitySyncEndpointEvidence"));
});

test("RTB sync-path-only observations remain eligible when multiple independent endpoints are retained", () => {
  const decision = evaluateFindingEvidenceContractForRawEvidence("rtb_cookie_sync_observed", {
    rtb_cookie_sync_evidence: [
      {
        hostname: "sync-one.example-adtech.test",
        path_sample: "/sync",
        reason: "sync_path"
      },
      {
        hostname: "match.example-identity.test",
        path_sample: "/match",
        reason: "sync_path"
      }
    ]
  });

  assert.equal(decision?.status, "pass_good");
});

test("RTB sync-path evidence ignores generic asset and API path sync substrings", () => {
  const decision = evaluateFindingEvidenceContractForRawEvidence("rtb_cookie_sync_observed", {
    rtb_cookie_sync_evidence: [
      {
        hostname: "www.example-shop.test",
        pathSample: "/cdn/shopifycloud/shop-js/modules/client.shop-cart-sync.en.esm.js",
        reason: "sync_path",
        category: "identity_sync"
      },
      {
        hostname: "api.example-news.test",
        pathSample: "/sports/v1/events/schedule/season/2025/tournament/0101/match-day/35",
        reason: "sync_path",
        category: "identity_sync"
      }
    ]
  });

  assert.equal(decision?.status, "downgrade");
  assert.ok(decision?.missingRequirements.includes("rtbOrIdentitySyncEndpointEvidence"));
});

test("RTB evidence treats callback-only generic data-sync API requests as audit-only", () => {
  const decision = evaluateFindingEvidenceContractForRawEvidence("rtb_cookie_sync_observed", {
    rtb_cookie_sync_evidence: [
      {
        category: "identity_sync",
        hostname: "www-api.ibm.com",
        pathSample: "/data-sync/dbdm-data",
        queryKeysSample: ["callback"],
        reason: "sync_path",
        statusCode: 200
      }
    ]
  });

  assert.equal(decision?.status, "downgrade");
  assert.ok(decision?.missingRequirements.includes("rtbOrIdentitySyncEndpointEvidence"));
});

test("RTB evidence accepts known TrafficJunky idsync endpoint pattern", () => {
  const decision = evaluateFindingEvidenceContractForRawEvidence("rtb_cookie_sync_observed", {
    rtb_cookie_sync_evidence: [
      {
        hostname: "static.trafficjunky.com",
        pathSample: "/invocation/idsync/production/idsync.min.js",
        reason: "known_sync_endpoint",
        statusCode: 200
      }
    ]
  });

  assert.equal(decision?.status, "pass_good");
});

test("RTB redirect-chain evidence projects without identifier query keys", () => {
  const decision = evaluateFindingEvidenceContractForRawEvidence("rtb_cookie_sync_observed", {
    rtb_cookie_sync_evidence: [
      {
        hostname: "pixel.example-adtech.test",
        path_sample: "/idsync/ex/push",
        reason: "redirect_sync",
        redirect_target_host: "match.example-identity.test"
      }
    ]
  });

  assert.equal(decision?.status, "pass_good");
});

test("RTB known endpoint evidence projects with concrete retained request shape", () => {
  const decision = evaluateFindingEvidenceContractForRawEvidence("rtb_cookie_sync_observed", {
    rtb_cookie_sync_evidence: [
      {
        category: "identity_sync",
        hostname: "ib.example-adtech.test",
        path_sample: "/getuid",
        reason: "sync_path"
      }
    ]
  });

  assert.equal(decision?.status, "pass_good");
});

test("material bot block prevents strong runtime findings", () => {
  const decision = evaluateFindingEvidenceContractForRawEvidence("preconsent_tracking", {
    botBlockChallengeEvidence: { blocked: true, coverageImpact: "material" },
    consentTimeline,
    requestPurposeClassificationConfidence: [nonEssentialRequest],
    runtimeRequestUrls: [nonEssentialRequest.requestUrl]
  });

  assert.equal(decision?.status, "downgrade");
  assert.ok(decision?.missingRequirements.includes("coverageNotMateriallyBlocked"));
});

test("new runtime contracts require concrete retained evidence shapes", () => {
  assert.equal(
    evaluateFindingEvidenceContractForRawEvidence("cross_domain_identifier_sharing_observed", {
      cross_domain_identifier_sharing_observed: true
    })?.status,
    "downgrade"
  );

  assert.equal(
    evaluateFindingEvidenceContractForRawEvidence("cross_domain_identifier_sharing_observed", {
      cross_domain_identifier_sharing_evidence: [
        {
          repeated_across_etlds: ["adnxs.com", "rlcdn.com"],
          request_url_redacted: "https://sync.adnxs.com/getuid?uid=%5Bredacted%5D",
          value_hash: "a".repeat(64)
        }
      ]
    })?.status,
    "pass_strong"
  );

  assert.equal(
    evaluateFindingEvidenceContractForRawEvidence("cross_domain_identifier_sharing_observed", {
      cross_domain_identifier_sharing_destination_categories: ["identity_graph"],
      cross_domain_identifier_sharing_destination_etlds: ["liveramp.com"],
      cross_domain_identifier_sharing_evidence: [
        {
          destination_classification: "identity_graph",
          destination_domain: "api.liveramp.com",
          destination_etld_plus_one: "liveramp.com",
          identifier_class: "durable_id",
          key: "partnerid",
          repeated_across_etlds: ["liveramp.com"],
          request_url_redacted: "https://api.liveramp.com/pixel?partnerid=%5Bredacted%5D",
          value_hash: "b".repeat(64)
        }
      ]
    })?.status,
    "pass_strong"
  );

});

test("sensitive, video, and fingerprinting contracts stay evidence-only", () => {
  assert.equal(
    evaluateFindingEvidenceContractForRawEvidence("video_content_tracking_exposure", {
      meta_pixel_request_urls: ["https://www.facebook.com/tr/?ev=PageView"],
      same_page_video_tracking_correlation: true,
      video_page_urls: ["https://example.com/watch/highlights"],
      video_title_snippets: ["Week 1 highlights"]
    })?.status,
    "pass_strong"
  );

  assert.equal(
    evaluateFindingEvidenceContractForRawEvidence("fingerprinting_observed", {
      device_data_like_request_count: 1,
      fingerprint_tier: 2,
      fingerprint_attribute_categories: ["canvas_webgl", "audio"],
      fingerprinting_runtime_evidence: [{ signal: "canvas_readback", url: "https://fp.example.net/collect" }]
    })?.status,
    "pass_strong"
  );

  assert.equal(
    evaluateFindingEvidenceContractForRawEvidence("possible_session_replay_on_sensitive_input_surface", {
      sensitivePayloadViolations: [
        {
          evidenceSource: "sensitive_field_session_replay_correlation",
          evidenceStrength: "form_field_signal",
          requestUrl: "https://clarity.ms/collect",
          sameFlowLinkage: { samePageOrFlow: true },
          vendorHost: "clarity.ms"
        }
      ]
    })?.status,
    "pass_strong"
  );

  assert.equal(
    evaluateFindingEvidenceContractForRawEvidence("possible_session_replay_on_sensitive_input_surface", {
      sensitivePayloadViolations: [
        {
          detectedType: "postal_code_detected",
          evidenceSource: "sensitive_field_session_replay_correlation",
          evidenceStrength: "suspected",
          matchSnippet: "zipcode=64***18",
          requestUrl: "https://api.example.com/location?zipcode=64118",
          sameFlowLinkage: { samePageOrFlow: true },
          sourceField: "zipcode",
          vendorHost: "api.example.com"
        }
      ],
      session_replay_runtime_detected: true,
      session_replay_runtime_vendors: ["FullStory"]
    })?.status,
    "pass_strong"
  );

  assert.equal(
    evaluateFindingEvidenceContractForRawEvidence("sensitive_data_collection_with_third_party_tracking_present", {
      sensitivePayloadViolations: [
        {
          evidenceSource: "sensitive_field_third_party_tracking_correlation",
          evidenceStrength: "form_field_signal",
          requestUrl: "https://analytics.example.net/collect",
          sameFlowLinkage: { samePageOrFlow: true },
          vendorHost: "analytics.example.net"
        }
      ]
    })?.status,
    "pass_strong"
  );

  assert.equal(
    evaluateFindingEvidenceContractForRawEvidence("sensitive_data_collection_with_third_party_tracking_present", {
      sensitivePayloadViolations: [
        {
          detectedType: "email",
          evidenceStrength: "concrete_payload",
          payloadExposureObserved: true,
          requestUrl: "https://analytics.example.net/collect",
          vendorHost: "analytics.example.net"
        }
      ]
    })?.status,
    "pass_strong"
  );

  assert.equal(
    evaluateFindingEvidenceContractForRawEvidence("session_replay_present_with_sensitive_surfaces_observed", {
      sensitivePayloadViolations: [
        {
          evidenceSource: "sensitive_field_session_replay_correlation",
          evidenceStrength: "form_field_signal",
          requestUrl: "https://clarity.ms/collect",
          sameFlowLinkage: { samePageOrFlow: true },
          vendorHost: "clarity.ms"
        }
      ],
      session_replay_runtime_detected: true,
      session_replay_runtime_vendors: ["Microsoft Clarity"]
    })?.status,
    "pass_strong"
  );

  assert.equal(
    evaluateFindingEvidenceContractForRawEvidence("sensitive_data_collection_with_third_party_tracking_present", {
      runtime_request_urls: ["https://analytics.example.net/collect"],
      runtime_vendors: ["Example Analytics"],
      sensitive_data_types: ["health_information"],
      sensitive_input_surface_evidence: [{ fieldType: "health", pageUrl: "https://example.com/intake" }]
    })?.status,
    "downgrade"
  );

  assert.equal(
    evaluateFindingEvidenceContractForRawEvidence("sensitive_data_collection_with_third_party_tracking_present", {
      sensitivePayloadViolations: [
        {
          evidenceSource: "sensitive_field_third_party_tracking_correlation",
          evidenceStrength: "form_field_signal",
          requestUrl: "https://analytics.example.net/collect",
          vendorHost: "analytics.example.net"
        }
      ]
    })?.status,
    "downgrade"
  );
});

test("sensitive replay contracts downgrade when same-page or same-flow linkage is absent", () => {
  assert.equal(
    evaluateFindingEvidenceContractForRawEvidence("possible_session_replay_on_sensitive_input_surface", {
      sensitivePayloadViolations: [
        {
          evidenceSource: "sensitive_field_session_replay_correlation",
          evidenceStrength: "form_field_signal",
          requestUrl: "https://clarity.ms/collect",
          vendorHost: "clarity.ms"
        }
      ],
      session_replay_runtime_detected: true,
      session_replay_runtime_vendors: ["Microsoft Clarity"]
    })?.status,
    "downgrade"
  );

  assert.equal(
    evaluateFindingEvidenceContractForRawEvidence("session_replay_present_with_sensitive_surfaces_observed", {
      sensitiveFieldEvidence: [
        {
          dataType: "email",
          signalKey: "commerce.email_input_present",
          sourceField: "email"
        }
      ],
      session_replay_runtime_detected: true,
      session_replay_runtime_vendors: ["Microsoft Clarity"]
    })?.status,
    "downgrade"
  );
});
