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
      "cpra_cba_opt_out_missing",
      "cross_domain_identifier_sharing_observed",
      "dark_pattern_consent_signals_detected",
      "fingerprinting_observed",
      "non_essential_tracking_continued_after_reject",
      "pre_consent_tracking_detected",
      "reject_option_missing_or_hidden",
      "rtb_cookie_sync_observed",
      "sensitive_data_collection_with_third_party_tracking_present",
      "session_replay_on_sensitive_input_surface",
      "session_replay_undisclosed",
      "third_party_tracking_before_consent",
      "tracking_cookies_set_before_consent",
      "video_content_tracking_exposure"
    ].sort()
  );
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
    suppressionChecks: {
      reject_click_confirmed: true
    }
  });

  assert.equal(decision?.status, "downgrade");
  assert.equal(decision?.allowedNarrativeTier, "weak");
  assert.equal(decision?.promotionEligibility, "internal_only");
  assert.ok(decision?.missingRequirements.includes("postRejectTimestampedRuntimeEvidence"));
});

test("reject hidden requires inspected banner and reject path evidence", () => {
  const weakDecision = evaluateFindingEvidenceContractForRawEvidence("reject_button_missing", {
    privacy_dark_pattern_reject_button_missing: true
  });
  const strongDecision = evaluateFindingEvidenceContractForRawEvidence("reject_button_missing", {
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

test("dark-pattern consent signals require verified banner UI evidence", () => {
  const weakDecision = evaluateFindingEvidenceContractForRawEvidence("accept_only_banner", {
    accept_only_banner: true
  });
  const strongDecision = evaluateFindingEvidenceContractForRawEvidence("accept_only_banner", {
    accept_only_banner: true,
    consentSurfaceObserved: true,
    consentUiArtifactRefs: ["hybrid_runtime_evidence"],
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

  assert.equal(weakDecision?.status, "downgrade");
  assert.ok(weakDecision?.missingRequirements.includes("materialChoiceAsymmetryEvidence"));
  assert.equal(strongDecision?.status, "pass_strong");
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

test("RTB observed can surface as runtime RTB but not strong pre-consent RTB without timeline", () => {
  const decision = evaluateFindingEvidenceContractForRawEvidence("rtb_cookie_sync_observed", {
    rtb_cookie_sync_evidence: [rtbEvidence]
  });

  assert.equal(decision?.status, "pass_good");
  assert.equal(decision?.allowedNarrativeTier, "moderate");
  assert.ok(decision?.missingRequirements.includes("consentTimelineSequence"));
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
    evaluateFindingEvidenceContractForRawEvidence("cpra_cba_opt_out_missing", {
      cpra_cba_opt_out_evidence: {
        advertisingSharingVendors: ["Meta Pixel"],
        choice_controls_inspected: true,
        opt_out_control_found: false,
        policy_cba_language: "full_cba_language"
      }
    })?.status,
    "pass_strong"
  );

  assert.equal(
    evaluateFindingEvidenceContractForRawEvidence("cpra_cba_opt_out_missing", {
      cbaVendorTier1: ["adsrvr.org"],
      cbaVendorTier2: [],
      optOutUiResult: "absent",
      policyCbaLanguage: "full_cba_language",
      suppressorApplied: null,
      limitation: "homepage_only"
    })?.status,
    "pass_strong"
  );

  assert.equal(
    evaluateFindingEvidenceContractForRawEvidence("cpra_cba_opt_out_missing", {
      cpra_cba_opt_out_evidence: {
        advertisingSharingVendors: ["Meta Pixel"],
        choice_controls_inspected: true,
        opt_out_control_found: false,
        opt_out_ui_result: "absent",
        policy_cba_language: "absent",
        scan_origin_geo: null
      }
    })?.externalSurfacingEligibility,
    "audit_only"
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
      fingerprinting_runtime_evidence: [{ signal: "canvas_readback", url: "https://fp.example.net/collect" }]
    })?.status,
    "pass_strong"
  );

  assert.equal(
    evaluateFindingEvidenceContractForRawEvidence("session_replay_on_sensitive_input_surface", {
      sensitivePayloadViolations: [
        {
          evidenceSource: "sensitive_field_session_replay_correlation",
          evidenceStrength: "form_field_signal",
          requestUrl: "https://clarity.ms/collect",
          vendorHost: "clarity.ms"
        }
      ]
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
          vendorHost: "analytics.example.net"
        }
      ]
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
});
