import assert from "node:assert/strict";
import test from "node:test";

import { CALIFORNIA_PRIVACY_RUNTIME_ARTIFACT_FIXTURES } from "../../../../packages/shared/src/regulatory-review/california-privacy-runtime-fixtures";
import { deriveCaliforniaPrivacyCoveragePolicyOutcomes } from "./california-privacy-coverage-policy";

test("deriveCaliforniaPrivacyCoveragePolicyOutcomes emits machine statuses for California rows", () => {
  const outcomes = deriveCaliforniaPrivacyCoveragePolicyOutcomes({
    coverageLimited: false,
    runtimeArtifacts: {
      californiaPrivacyEvidence: {
        privacyNoticeObserved: true,
        privacyNoticeUrls: ["https://example.test/privacy"],
        verifiedPrivacyNoticeUrls: ["https://example.test/privacy"],
        collectionContextObserved: false,
        collectionContextUrls: [],
        targetedAdvertisingSignalsObserved: true,
        advertisingSharingVendors: ["Meta"],
        saleShareRequestUrls: ["https://connect.facebook.net/en_US/fbevents.js"],
        doNotSellSharePathObserved: false,
        gpcTestRan: true,
        gpcSignalSent: true,
        gpcRecognitionObserved: false,
        policyRuntimeDisclosureAlignment: "review",
        sensitivePiContextObserved: false,
        limitUseSensitivePiPathObserved: null,
        optOutInteractionConfirmed: null,
        postOptOutTrackingReductionObserved: null,
        postOptOutTrackingPersisted: null,
        consumerRightsRequestMethodObserved: true,
        consumerRightsRequestMethodSnippets: ["Submit a California privacy rights request to access, delete, or correct your data."],
        consumerRightsRequestMethodUrls: ["https://example.test/privacy-request"],
        consumerRightsRequestMethodTypes: ["web_form"],
        privacyControlAccessibilityIssueObserved: true,
        privacyControlAccessibilitySignals: ["button_name"],
        evidenceRefs: ["artifact=california_privacy_001"]
      }
    },
    scanCompleted: true
  });

  assert.equal(outcomes.privacy_notice_availability?.status, "observed");
  assert.equal(outcomes.notice_at_collection?.status, "review_signal");
  assert.equal(
    outcomes.notice_at_collection?.criticalEvidence.statusBasis,
    "Notice surface was retained, but no point-of-collection context was tested."
  );
  assert.equal(outcomes.do_not_sell_share_availability?.status, "potential_gap");
  assert.equal(outcomes.gpc_opt_out_signal_handling?.status, "potential_gap");
  assert.equal(outcomes.targeted_advertising_signals?.status, "observed");
  assert.equal(outcomes.limit_use_sensitive_pi?.status, "not_applicable");
  assert.equal(outcomes.post_opt_out_tracking_behavior?.status, "not_applicable");
  assert.equal(outcomes.consumer_rights_request_methods?.status, "observed");
  assert.equal(outcomes.privacy_control_accessibility?.status, "potential_gap");
  assert.equal(outcomes.consumer_rights_request_methods?.criticalEvidence.evidenceFamily, "rights_methods");
  assert.equal(
    outcomes.do_not_sell_share_availability?.criticalEvidence.pipeline.regulatoryReviewArea,
    "california_ccpa_cpra"
  );
});

test("deriveCaliforniaPrivacyCoveragePolicyOutcomes treats completed collection sweep without public collection context as not applicable", () => {
  const outcomes = deriveCaliforniaPrivacyCoveragePolicyOutcomes({
    coverageLimited: false,
    runtimeArtifacts: {
      californiaPrivacyEvidence: {
        privacyNoticeObserved: true,
        privacyNoticeUrls: ["https://tv.apple.com/legal/privacy"],
        verifiedPrivacyNoticeUrls: ["https://tv.apple.com/legal/privacy"],
        collectionContextObserved: false,
        collectionContextUrls: [],
        collectionNoticeCueObserved: null,
        collectionNoticeEvidenceKind: "policy_notice_text_only",
        collectionSurfaceSearchAttempted: true,
        collectionSurfaceCandidateUrls: [
          "https://tv.apple.com/contact",
          "https://tv.apple.com/newsletter"
        ],
        collectionSurfaceVisitedUrls: [
          "https://tv.apple.com/contact",
          "https://tv.apple.com/newsletter"
        ],
        collectionSurfaceBlockedUrls: [],
        pointOfCollectionContextTested: true,
        collectionContextNegativeReviewSufficient: true,
        collectionContextCoverageLimitation: "bounded_sweep_no_collection_context",
        targetedAdvertisingSignalsObserved: false,
        directAdvertisingSharingVendors: [],
        doNotSellSharePathObserved: false,
        gpcTestRan: false,
        sensitivePiContextObserved: false,
        consumerRightsRequestMethodObserved: false,
        rightsLanguageObserved: false
      }
    },
    scanCompleted: true
  });

  assert.equal(outcomes.notice_at_collection?.status, "not_applicable");
  assert.equal(
    outcomes.notice_at_collection?.criticalEvidence.statusBasis,
    "Bounded collection-surface sweep did not retain an eligible point-of-collection context."
  );
  assert.equal(
    outcomes.notice_at_collection?.criticalEvidence.retainedEvidence.collectionContextNegativeReviewSufficient,
    true
  );
  assert.deepEqual(
    outcomes.notice_at_collection?.criticalEvidence.retainedEvidence.collectionSurfaceVisitedUrls,
    ["https://tv.apple.com/contact", "https://tv.apple.com/newsletter"]
  );
});

test("deriveCaliforniaPrivacyCoveragePolicyOutcomes treats collection form without nearby notice as potential gap", () => {
  const outcomes = deriveCaliforniaPrivacyCoveragePolicyOutcomes({
    coverageLimited: false,
    runtimeArtifacts: {
      californiaPrivacyEvidence: {
        privacyNoticeObserved: true,
        privacyNoticeUrls: ["https://example.test/privacy"],
        verifiedPrivacyNoticeUrls: ["https://example.test/privacy"],
        collectionContextObserved: true,
        collectionContextUrls: ["https://example.test/newsletter"],
        collectionContextTypes: ["email"],
        collectionNoticeCueObserved: false,
        collectionNoticeEvidenceKind: "collection_form_without_notice",
        collectionSurfaceSearchAttempted: true,
        collectionSurfaceCandidateUrls: ["https://example.test/newsletter"],
        collectionSurfaceVisitedUrls: ["https://example.test/newsletter"],
        collectionSurfaceBlockedUrls: [],
        pointOfCollectionContextTested: true,
        collectionContextNegativeReviewSufficient: false,
        collectionContextCoverageLimitation: "collection_context_tested",
        targetedAdvertisingSignalsObserved: false,
        directAdvertisingSharingVendors: [],
        doNotSellSharePathObserved: false,
        gpcTestRan: false,
        sensitivePiContextObserved: false,
        consumerRightsRequestMethodObserved: false,
        rightsLanguageObserved: false
      }
    },
    scanCompleted: true
  });

  assert.equal(outcomes.notice_at_collection?.status, "potential_gap");
  assert.equal(
    outcomes.notice_at_collection?.criticalEvidence.statusBasis,
    "An eligible collection context was retained without a nearby privacy notice or collection disclosure cue."
  );
  assert.equal(outcomes.notice_at_collection?.criticalEvidence.retainedEvidence.pointOfCollectionContextTested, true);
});

test("deriveCaliforniaPrivacyCoveragePolicyOutcomes does not treat blocked collection candidates as a clean negative", () => {
  const outcomes = deriveCaliforniaPrivacyCoveragePolicyOutcomes({
    coverageLimited: false,
    runtimeArtifacts: {
      californiaPrivacyEvidence: {
        privacyNoticeObserved: true,
        privacyNoticeUrls: ["https://example.test/privacy"],
        verifiedPrivacyNoticeUrls: ["https://example.test/privacy"],
        collectionContextObserved: false,
        collectionContextUrls: [],
        collectionNoticeCueObserved: null,
        collectionNoticeEvidenceKind: "policy_notice_text_only",
        collectionSurfaceSearchAttempted: true,
        collectionSurfaceCandidateUrls: ["https://example.test/contact"],
        collectionSurfaceVisitedUrls: [],
        collectionSurfaceBlockedUrls: ["https://example.test/contact"],
        pointOfCollectionContextTested: true,
        collectionContextNegativeReviewSufficient: false,
        collectionContextCoverageLimitation: "blocked_or_interstitial",
        targetedAdvertisingSignalsObserved: false,
        directAdvertisingSharingVendors: [],
        doNotSellSharePathObserved: false,
        gpcTestRan: false,
        sensitivePiContextObserved: false,
        consumerRightsRequestMethodObserved: false,
        rightsLanguageObserved: false
      }
    },
    scanCompleted: true
  });

  assert.equal(outcomes.notice_at_collection?.status, "review_signal");
  assert.equal(
    outcomes.notice_at_collection?.criticalEvidence.statusBasis,
    "Collection-surface candidates were retained, but the tested sweep was blocked or incomplete."
  );
});

test("deriveCaliforniaPrivacyCoveragePolicyOutcomes treats unconfirmed privacy-choice interaction as not testable for post-opt-out behavior", () => {
  const outcomes = deriveCaliforniaPrivacyCoveragePolicyOutcomes({
    coverageLimited: false,
    runtimeArtifacts: {
      californiaPrivacyEvidence: {
        privacyNoticeObserved: true,
        privacyNoticeUrls: ["https://example.test/privacy"],
        verifiedPrivacyNoticeUrls: ["https://example.test/privacy"],
        collectionContextObserved: false,
        targetedAdvertisingSignalsObserved: true,
        advertisingSharingVendors: ["Example Ads"],
        saleShareRequestUrls: ["https://ads.example.test/pixel"],
        doNotSellSharePathObserved: false,
        privacyChoiceInteractionEvidence: {
          attempted: true,
          pathObserved: true,
          selectedUrl: "https://example.test/privacy-choices",
          selectedLabel: "Your Privacy Choices",
          outcome: "opened_preference_center",
          clickConfirmed: true,
          beforeTrackerCount: 4,
          afterTrackerCount: 5,
          persistedTrackerVendors: ["Example Ads"],
          newTrackerVendors: ["Example Retargeting"],
          visibleTextSnippets: ["Your Privacy Choices", "Opt out of targeted advertising"],
          evidenceUrls: ["https://ads.example.test/pixel"]
        },
        optOutInteractionConfirmed: false,
        postOptOutTrackingReductionObserved: null,
        postOptOutTrackingPersisted: null,
        gpcTestRan: false,
        sensitivePiContextObserved: false,
        consumerRightsRequestMethodObserved: true,
        consumerRightsRequestMethodUrls: ["https://example.test/privacy-request"],
        privacyControlAccessibilityIssueObserved: false,
        policyRuntimeDisclosureAlignment: "review"
      }
    },
    scanCompleted: true
  });

  assert.equal(outcomes.opt_out_friction_dark_patterns?.status, "not_applicable");
  assert.equal(outcomes.post_opt_out_tracking_behavior?.status, "not_testable");
  assert.equal(
    outcomes.post_opt_out_tracking_behavior?.criticalEvidence.retainedEvidence.privacyChoiceInteractionEvidence,
    outcomes.opt_out_friction_dark_patterns?.criticalEvidence.retainedEvidence.privacyChoiceInteractionEvidence
  );
  assert.equal(
    outcomes.post_opt_out_tracking_behavior?.criticalEvidence.missingOrIncompleteSourceSignals.length,
    3
  );
});

test("deriveCaliforniaPrivacyCoveragePolicyOutcomes keeps credential-only sensitive context out of Limit Use gaps", () => {
  const outcomes = deriveCaliforniaPrivacyCoveragePolicyOutcomes({
    coverageLimited: false,
    runtimeArtifacts: {
      californiaPrivacyEvidence: {
        privacyNoticeObserved: true,
        sensitivePiContextObserved: true,
        sensitivePiCategories: ["password"],
        sensitivePiContextUrls: ["https://example.test/login"],
        limitUseSensitivePiPathObserved: false,
        sensitiveThirdPartyTrackingObserved: false
      }
    },
    scanCompleted: true
  });

  assert.equal(outcomes.limit_use_sensitive_pi?.status, "not_applicable");
  assert.match(outcomes.limit_use_sensitive_pi?.limitation ?? "", /credential/i);
  assert.equal(outcomes.sensitive_forms_third_party_tracking?.status, "not_observed");
});

test("deriveCaliforniaPrivacyCoveragePolicyOutcomes does not double-count friction when no opt-out path is retained", () => {
  const outcomes = deriveCaliforniaPrivacyCoveragePolicyOutcomes({
    coverageLimited: false,
    runtimeArtifacts: {
      californiaPrivacyEvidence: {
        targetedAdvertisingSignalsObserved: true,
        advertisingSharingVendors: ["Example Ads"],
        saleShareRequestUrls: ["https://ads.example.test/pixel"],
        doNotSellSharePathObserved: false,
        optOutInteractionConfirmed: false,
        postOptOutTrackingReductionObserved: null,
        postOptOutTrackingPersisted: null
      }
    },
    scanCompleted: true
  });

  assert.equal(outcomes.opt_out_friction_dark_patterns?.status, "not_applicable");
  assert.equal(outcomes.post_opt_out_tracking_behavior?.status, "not_applicable");
  assert.equal(
    outcomes.post_opt_out_tracking_behavior?.criticalEvidence.statusBasis,
    "No CPRA opt-out or reject path/control was observed, so post-opt-out tracking behavior did not apply in this scan context."
  );
});

test("deriveCaliforniaPrivacyCoveragePolicyOutcomes treats retained no-path search as not applicable for post-opt-out behavior", () => {
  const outcomes = deriveCaliforniaPrivacyCoveragePolicyOutcomes({
    coverageLimited: false,
    runtimeArtifacts: {
      californiaPrivacyEvidence: {
        targetedAdvertisingSignalsObserved: true,
        advertisingSharingVendors: ["Example Ads"],
        saleShareRequestUrls: ["https://ads.example.test/pixel"],
        doNotSellSharePathObserved: false,
        privacyChoicePathEvidence: {
          attempted: true,
          observed: false,
          candidateCount: 0,
          candidateUrls: [],
          candidateLabels: [],
          interactionAttempted: true,
          interactionConfirmed: false,
          interactionOutcome: "no_observed_path"
        },
        privacyChoiceInteractionEvidence: {
          attempted: true,
          pathObserved: false,
          outcome: "no_observed_path",
          evidenceRefs: ["california_privacy_choice_exercise"],
          limitation: "no_observed_path"
        },
        optOutInteractionConfirmed: null,
        postOptOutTrackingReductionObserved: null,
        postOptOutTrackingPersisted: null
      }
    },
    scanCompleted: true
  });

  assert.equal(outcomes.do_not_sell_share_availability?.status, "potential_gap");
  assert.equal(outcomes.opt_out_friction_dark_patterns?.status, "not_applicable");
  assert.equal(outcomes.post_opt_out_tracking_behavior?.status, "not_applicable");
  assert.equal(
    outcomes.post_opt_out_tracking_behavior?.criticalEvidence.statusBasis,
    "No CPRA opt-out or reject path/control was observed, so post-opt-out tracking behavior did not apply in this scan context."
  );
  assert.equal(
    outcomes.post_opt_out_tracking_behavior?.criticalEvidence.retainedEvidence.privacyChoicePathEvidence,
    outcomes.opt_out_friction_dark_patterns?.criticalEvidence.retainedEvidence.privacyChoicePathEvidence
  );
});

test("deriveCaliforniaPrivacyCoveragePolicyOutcomes reads DB-backed snake_case California runtime evidence", () => {
  const outcomes = deriveCaliforniaPrivacyCoveragePolicyOutcomes({
    coverageLimited: false,
    runtimeArtifacts: {
      california_privacy_evidence: {
        privacyNoticeObserved: true,
        privacyNoticeUrls: ["https://example.test/privacy"],
        verifiedPrivacyNoticeUrls: ["https://example.test/privacy"],
        collectionContextObserved: false,
        targetedAdvertisingSignalsObserved: false,
        doNotSellSharePathObserved: false,
        gpcTestRan: false,
        consumerRightsRequestMethodObserved: true,
        consumerRightsRequestMethodSnippets: ["Email us to submit a privacy rights request to access, delete, or correct your data."],
        consumerRightsRequestMethodUrls: ["https://example.test/privacy-request"],
        consumerRightsRequestMethodTypes: ["email"],
        sensitivePiContextObserved: false,
        privacyControlAccessibilityIssueObserved: false,
        evidenceRefs: ["runtime_artifact:california_privacy"]
      }
    },
    scanCompleted: true
  });

  assert.equal(outcomes.privacy_notice_availability?.status, "observed");
  assert.equal(outcomes.consumer_rights_request_methods?.status, "observed");
  assert.notEqual(outcomes.privacy_notice_availability?.status, "not_testable");
});

test("deriveCaliforniaPrivacyCoveragePolicyOutcomes uses retained California evidence when scan coverage is limited", () => {
  const outcomes = deriveCaliforniaPrivacyCoveragePolicyOutcomes({
    coverageLimited: true,
    runtimeArtifacts: {
      california_privacy_evidence: {
        privacyNoticeObserved: true,
        privacyNoticeUrls: ["https://example.test/privacy"],
        verifiedPrivacyNoticeUrls: ["https://example.test/privacy"],
        collectionContextObserved: false,
        targetedAdvertisingSignalsObserved: false,
        doNotSellSharePathObserved: false,
        gpcTestRan: false,
        consumerRightsRequestMethodObserved: true,
        consumerRightsRequestMethodSnippets: ["Email us to submit a California consumer privacy rights request."],
        consumerRightsRequestMethodUrls: ["mailto:privacy@example.test"],
        consumerRightsRequestMethodTypes: ["email"],
        sensitivePiContextObserved: false,
        privacyControlAccessibilityIssueObserved: false,
        evidenceRefs: ["runtime_artifact:california_privacy"]
      }
    },
    scanCompleted: true
  });

  assert.equal(outcomes.privacy_notice_availability?.status, "observed");
  assert.equal(outcomes.consumer_rights_request_methods?.status, "observed");
  assert.equal(outcomes.gpc_opt_out_signal_handling?.status, "not_testable");
});

test("deriveCaliforniaPrivacyCoveragePolicyOutcomes does not create potential gaps from missing applicability evidence", () => {
  const outcomes = deriveCaliforniaPrivacyCoveragePolicyOutcomes({
    coverageLimited: false,
    runtimeArtifacts: {
      californiaPrivacyEvidence: {
        privacyNoticeObserved: null,
        privacyNoticeUrls: [],
        collectionContextObserved: null,
        collectionNoticeCueObserved: null,
        collectionContextUrls: [],
        targetedAdvertisingSignalsObserved: null,
        advertisingSharingVendors: [],
        doNotSellSharePathObserved: false,
        gpcTestRan: false,
        gpcSignalSent: null,
        gpcRecognitionObserved: null,
        sensitivePiContextObserved: null,
        sensitivePiCategories: [],
        limitUseSensitivePiPathObserved: null,
        limitUseSensitivePiPathUrl: null,
        optOutInteractionConfirmed: null,
        postOptOutTrackingReductionObserved: null,
        postOptOutTrackingPersisted: null,
        privacyControlAccessibilityIssueObserved: null,
        privacyControlAccessibilitySignals: [],
        policyRuntimeDisclosureAlignment: "not_testable",
        evidenceRefs: []
      }
    },
    scanCompleted: true
  });

  assert.equal(outcomes.do_not_sell_share_availability?.status, "not_testable");
  assert.equal(outcomes.privacy_notice_availability?.status, "not_testable");
  assert.equal(outcomes.consumer_rights_request_methods?.status, "not_testable");
});

test("deriveCaliforniaPrivacyCoveragePolicyOutcomes keeps unobserved privacy notices not testable without discovery context", () => {
  const outcomes = deriveCaliforniaPrivacyCoveragePolicyOutcomes({
    coverageLimited: false,
    runtimeArtifacts: {
      californiaPrivacyEvidence: {
        privacyNoticeObserved: false,
        privacyNoticeUrls: [],
        privacyNoticeSourceUrls: [],
        californiaNoticeCueObserved: false,
        collectionContextObserved: false,
        evidenceRefs: []
      }
    },
    scanCompleted: true
  });

  assert.equal(outcomes.privacy_notice_availability?.status, "not_testable");
  assert.equal(
    outcomes.privacy_notice_availability?.criticalEvidence.missingOrIncompleteSourceSignals[0]?.field,
    "californiaPrivacyEvidence.privacyNoticeDiscoveryEvidence"
  );
});

test("deriveCaliforniaPrivacyCoveragePolicyOutcomes can flag unobserved privacy notices when discovery context is retained", () => {
  const outcomes = deriveCaliforniaPrivacyCoveragePolicyOutcomes({
    coverageLimited: false,
    runtimeArtifacts: {
      californiaPrivacyEvidence: {
        privacyNoticeObserved: false,
        privacyNoticeSearchUrls: ["https://example.test/privacy", "https://example.test/legal/privacy"],
        californiaNoticeCueObserved: false,
        collectionContextObserved: false
      }
    },
    scanCompleted: true
  });

  assert.equal(outcomes.privacy_notice_availability?.status, "potential_gap");
  assert.deepEqual(
    outcomes.privacy_notice_availability?.criticalEvidence.retainedEvidence.privacyNoticeDiscoveryUrls,
    ["https://example.test/privacy", "https://example.test/legal/privacy"]
  );
});

test("deriveCaliforniaPrivacyCoveragePolicyOutcomes consumes structured privacy notice discovery evidence", () => {
  const outcomes = deriveCaliforniaPrivacyCoveragePolicyOutcomes({
    coverageLimited: false,
    runtimeArtifacts: {
      californiaPrivacyEvidence: {
        privacyNoticeObserved: false,
        privacyNoticeDiscoveryEvidence: {
          attempted: true,
          attemptedPrivacyNoticeUrls: ["https://example.test/privacy"],
          attemptedUrls: ["https://example.test/privacy", "https://example.test/terms"],
          blockedUrls: [],
          failedUrls: ["https://example.test/privacy"],
          homepageCandidateCount: 0,
          homepageFetchStatus: "ok",
          legalHubCandidateCount: 0,
          legalHubFetchStatus: null,
          legalHubTargetCount: 0,
          legalHubUrl: null,
          privacyTargetAttempted: true,
          privacyTargetVerified: false,
          source: "passive_public_surface_verification",
          usedUrlscanBackfill: true,
          verifiedPrivacyNoticeUrls: [],
          verifiedSurfaceTargets: ["terms_of_service"]
        },
        californiaNoticeCueObserved: false,
        collectionContextObserved: false
      }
    },
    scanCompleted: true
  });

  assert.equal(outcomes.privacy_notice_availability?.status, "potential_gap");
  assert.deepEqual(
    outcomes.privacy_notice_availability?.criticalEvidence.retainedEvidence.privacyNoticeDiscoveryEvidence,
    {
      attempted: true,
      attemptedPrivacyNoticeUrls: ["https://example.test/privacy"],
      attemptedUrls: ["https://example.test/privacy", "https://example.test/terms"],
      blockedUrls: [],
      failedUrls: ["https://example.test/privacy"],
      homepageCandidateCount: 0,
      homepageFetchStatus: "ok",
      legalHubCandidateCount: 0,
      legalHubFetchStatus: null,
      legalHubTargetCount: 0,
      legalHubUrl: null,
      privacyTargetAttempted: true,
      privacyTargetVerified: false,
      source: "passive_public_surface_verification",
      usedUrlscanBackfill: true,
      verifiedPrivacyNoticeUrls: [],
      verifiedSurfaceTargets: ["terms_of_service"]
    }
  );
});

test("deriveCaliforniaPrivacyCoveragePolicyOutcomes treats verified privacy notices as observed despite noisy candidates", () => {
  const outcomes = deriveCaliforniaPrivacyCoveragePolicyOutcomes({
    coverageLimited: false,
    runtimeArtifacts: {
      californiaPrivacyEvidence: {
        privacyNoticeObserved: true,
        privacyNoticeUrls: ["https://example.test/privacy"],
        verifiedPrivacyNoticeUrls: ["https://example.test/privacy"],
        privacyNoticeCandidateUrls: ["https://example.test/news/privacy-story"],
        privacyNoticeDiscoveryEvidence: {
          attempted: true,
          attemptedPrivacyNoticeUrls: ["https://example.test/privacy", "https://example.test/privacy-policy"],
          attemptedUrls: ["https://example.test/privacy", "https://example.test/privacy-policy"],
          blockedUrls: ["https://example.test/privacy-policy"],
          failedUrls: ["https://example.test/privacy-policy"],
          homepageCandidateCount: 1,
          homepageFetchStatus: "ok",
          legalHubCandidateCount: 1,
          legalHubFetchStatus: "ok",
          legalHubTargetCount: 1,
          legalHubUrl: "https://example.test/legal",
          privacyTargetAttempted: true,
          privacyTargetVerified: true,
          source: "passive_public_surface_verification",
          usedUrlscanBackfill: true,
          verifiedPrivacyNoticeUrls: ["https://example.test/privacy"],
          verifiedSurfaceTargets: ["privacy_policy"]
        }
      }
    },
    scanCompleted: true
  });

  assert.equal(outcomes.privacy_notice_availability?.status, "observed");
});

test("deriveCaliforniaPrivacyCoveragePolicyOutcomes reuses CPRA runtime artifact fallback evidence", () => {
  const outcomes = deriveCaliforniaPrivacyCoveragePolicyOutcomes({
    coverageLimited: false,
    runtimeArtifacts: {
      cpraCbaOptOutEvidence: {
        advertisingSharingVendors: ["Meta"],
        optOutControlFound: false
      }
    },
    scanCompleted: true
  });

  assert.equal(outcomes.do_not_sell_share_availability?.status, "not_observed");
  assert.equal(
    outcomes.do_not_sell_share_availability?.criticalEvidence.retainedEvidence.targetedAdvertisingSignalsObserved ?? null,
    null
  );
  assert.equal(outcomes.do_not_sell_share_availability?.criticalEvidence.retainedEvidence.doNotSellSharePathObserved, false);
  assert.deepEqual(outcomes.do_not_sell_share_availability?.criticalEvidence.retainedEvidence.advertisingSharingVendors ?? [], []);
  assert.deepEqual(outcomes.do_not_sell_share_availability?.criticalEvidence.retainedEvidence.advertisingSharingVendorLabelsRetained, ["Meta"]);
  assert.deepEqual(outcomes.do_not_sell_share_availability?.criticalEvidence.retainedEvidence.unmatchedAdvertisingSharingVendorLabels, ["Meta"]);
});

test("California calibration keeps Caltech-like partial evidence in review or not-testable posture", () => {
  const outcomes = deriveCaliforniaPrivacyCoveragePolicyOutcomes({
    coverageLimited: false,
    runtimeArtifacts: {
      californiaPrivacyEvidence: {
        privacyNoticeObserved: true,
        privacyNoticeUrls: ["https://example.edu/privacy"],
        privacyNoticeCandidateUrls: ["https://example.edu/privacy"],
        privacyNoticeDiscoveryEvidence: {
          attempted: true,
          attemptedPrivacyNoticeUrls: ["https://example.edu/privacy"],
          blockedUrls: ["https://example.edu/privacy"],
          failedUrls: [],
          privacyTargetAttempted: true,
          privacyTargetVerified: false,
          usedUrlscanBackfill: true,
          verifiedPrivacyNoticeUrls: []
        },
        collectionContextObserved: false,
        footerNoticeCueObserved: false,
        targetedAdvertisingSignalsObserved: false,
        directAdvertisingSharingVendors: [],
        analyticsTagManagementVendors: ["Google Analytics", "Google Tag Manager"],
        analyticsOrMeasurementCookieNames: ["_ga", "_ga_ABC123"],
        analyticsOrMeasurementRequestUrls: ["https://www.googletagmanager.com/gtm.js?id=GTM-ABC123"],
        utilityOrInfrastructureRequestUrls: ["https://cdn.example.edu/mathjax.js"],
        saleShareCookieNames: [],
        saleShareRequestUrls: [],
        doNotSellSharePathObserved: false,
        gpcTestRan: false,
        consumerRightsRequestMethodObserved: false,
        rightsLanguageObserved: false,
        sensitivePiContextObserved: false,
        sensitiveThirdPartyTrackingObserved: false,
        sensitiveThirdPartyTrackingRequestUrls: [],
        sensitiveThirdPartyTrackingVendors: []
      }
    },
    scanCompleted: true
  });

  assert.equal(outcomes.privacy_notice_availability?.status, "not_testable");
  assert.equal(outcomes.notice_at_collection?.status, "review_signal");
  assert.equal(outcomes.targeted_advertising_signals?.status, "not_observed");
  assert.equal(outcomes.do_not_sell_share_availability?.status, "not_applicable");
  assert.equal(
    outcomes.do_not_sell_share_availability?.criticalEvidence.retainedEvidence.saleShareApplicabilityObserved,
    false
  );
  assert.deepEqual(outcomes.do_not_sell_share_availability?.criticalEvidence.retainedEvidence.saleShareCookieNames ?? [], []);
  assert.deepEqual(outcomes.do_not_sell_share_availability?.criticalEvidence.retainedEvidence.saleShareRequestUrls ?? [], []);
  assert.equal(outcomes.sale_share_disclosure_alignment?.status, "not_applicable");
  assert.equal(outcomes.sensitive_forms_third_party_tracking?.status, "not_observed");
  assert.deepEqual(
    outcomes.sensitive_forms_third_party_tracking?.criticalEvidence.retainedEvidence.sensitiveThirdPartyTrackingRequestUrls ?? [],
    []
  );
  assert.deepEqual(
    outcomes.sensitive_forms_third_party_tracking?.criticalEvidence.retainedEvidence.sensitiveThirdPartyTrackingVendors ?? [],
    []
  );
  assert.equal(outcomes.gpc_opt_out_signal_handling?.status, "not_testable");
  assert.equal(outcomes.consumer_rights_request_methods?.status, "not_testable");
});

test("California cohort regression keeps analytics-only privacy-choice scans out of direct sale/share gaps", () => {
  const outcomes = deriveCaliforniaPrivacyCoveragePolicyOutcomes({
    coverageLimited: true,
    runtimeArtifacts: {
      californiaPrivacyEvidence: {
        privacyNoticeObserved: true,
        privacyNoticeUrls: ["https://example.test/privacy"],
        verifiedPrivacyNoticeUrls: ["https://example.test/privacy"],
        collectionContextObserved: false,
        californiaNoticeCueObserved: true,
        footerNoticeCueObserved: true,
        collectionNoticeEvidenceKind: "footer_notice_link_only",
        targetedAdvertisingSignalsObserved: false,
        directAdvertisingSharingVendors: [],
        directSaleShareOrTargetedAdvertisingVendors: [],
        analyticsTagManagementVendors: ["Datadog RUM", "Google Tag Manager", "Segment"],
        analyticsOrMeasurementVendors: ["Datadog RUM", "Google Tag Manager", "Segment"],
        doNotSellSharePathObserved: true,
        doNotSellSharePathUrl: "https://privacyportal.onetrust.com/webform/example",
        privacyChoiceUrls: ["https://privacyportal.onetrust.com/webform/example"],
        privacyChoicePathEvidence: {
          attempted: true,
          observed: true,
          selectedUrl: "https://privacyportal.onetrust.com/webform/example",
          selectedLabel: "Your Privacy Choices",
          selectionBasis: "privacy_choice_link",
          limitation: "discovery_only",
          interactionAttempted: false,
          interactionConfirmed: null
        },
        optOutInteractionConfirmed: null,
        postOptOutTrackingReductionObserved: null,
        postOptOutTrackingPersisted: null,
        gpcTestRan: false,
        sensitivePiContextObserved: false
      }
    },
    scanCompleted: true
  });

  assert.equal(outcomes.targeted_advertising_signals?.status, "not_observed");
  assert.match(outcomes.targeted_advertising_signals?.limitation ?? "", /No eligible targeted advertising/i);
  assert.equal(outcomes.do_not_sell_share_availability?.status, "not_applicable");
  assert.notEqual(outcomes.do_not_sell_share_availability?.status, "potential_gap");
  assert.equal(outcomes.post_opt_out_tracking_behavior?.status, "not_testable");
  assert.equal(outcomes.gpc_opt_out_signal_handling?.status, "not_testable");
  assert.deepEqual(
    outcomes.do_not_sell_share_availability?.criticalEvidence.retainedEvidence.advertisingSharingVendors ?? [],
    []
  );
});

test("California blocks interstitial snippets from satisfying positive notice or rights rows", () => {
  const outcomes = deriveCaliforniaPrivacyCoveragePolicyOutcomes({
    coverageLimited: true,
    runtimeArtifacts: {
      californiaPrivacyEvidence: {
        privacyNoticeObserved: true,
        privacyNoticeUrls: ["https://example.test/blocked?url=https%3A%2F%2Fexample.test%2Fprivacy"],
        privacyNoticeDiscoveryEvidence: {
          attempted: true,
          attemptedPrivacyNoticeUrls: ["https://example.test/privacy"],
          blockedUrls: ["https://example.test/blocked?url=https%3A%2F%2Fexample.test%2Fprivacy"],
          privacyTargetAttempted: true,
          privacyTargetVerified: false,
          verifiedPrivacyNoticeUrls: []
        },
        collectionContextObserved: false,
        targetedAdvertisingSignalsObserved: false,
        doNotSellSharePathObserved: false,
        consumerRightsRequestMethodObserved: true,
        consumerRightsRequestMethodSnippets: [
          "You have been blocked. Email the site owner because a security solution blocked this request."
        ],
        rightsLanguageObserved: false,
        gpcTestRan: false,
        sensitivePiContextObserved: false,
        privacyControlAccessibilityIssueObserved: null
      }
    },
    scanCompleted: true
  });

  assert.equal(outcomes.privacy_notice_availability?.status, "not_testable");
  assert.match(outcomes.privacy_notice_availability?.limitation ?? "", /blocked or interstitial/);
  assert.equal(outcomes.consumer_rights_request_methods?.status, "not_testable");
  assert.equal(
    outcomes.consumer_rights_request_methods?.criticalEvidence.retainedEvidence.consumerRightsRequestMethodSnippets,
    undefined
  );
});

test("California keeps generic privacy-choice paths separate from CPRA sale/share opt-out paths", () => {
  const outcomes = deriveCaliforniaPrivacyCoveragePolicyOutcomes({
    coverageLimited: false,
    runtimeArtifacts: {
      californiaPrivacyEvidence: {
        privacyNoticeObserved: true,
        privacyNoticeUrls: ["https://example.test/privacy"],
        verifiedPrivacyNoticeUrls: ["https://example.test/privacy"],
        collectionContextObserved: false,
        targetedAdvertisingSignalsObserved: true,
        directAdvertisingSharingVendors: ["Example Ads"],
        saleShareRequestUrls: ["https://ads.example.test/pixel"],
        privacyChoicePathEvidence: {
          attempted: true,
          observed: true,
          searchScope: "discovered_links",
          candidateCount: 1,
          candidateUrls: ["https://example.test/search-history"],
          candidateLabels: ["Search history"],
          selectedUrl: "https://example.test/search-history",
          selectedLabel: "Search history",
          selectionBasis: "privacy_choice_link",
          sourceSignals: ["privacy_control_link"],
          interactionAttempted: false,
          interactionConfirmed: null,
          interactionOutcome: null,
          limitation: "discovery_only"
        },
        doNotSellSharePathObserved: null,
        gpcTestRan: false,
        policyRuntimeDisclosureAlignment: "review",
        sensitivePiContextObserved: false,
        consumerRightsRequestMethodObserved: false,
        rightsLanguageObserved: true,
        privacyControlAccessibilityIssueObserved: null
      }
    },
    scanCompleted: true
  });

  assert.equal(outcomes.do_not_sell_share_availability?.status, "potential_gap");
  assert.equal(
    outcomes.do_not_sell_share_availability?.criticalEvidence.retainedEvidence.privacyChoicePathObserved,
    true
  );
  assert.equal(
    outcomes.do_not_sell_share_availability?.criticalEvidence.retainedEvidence.cpraSaleShareOptOutPathObserved,
    false
  );
  assert.equal(outcomes.consumer_rights_request_methods?.status, "review_signal");
  assert.equal(
    outcomes.consumer_rights_request_methods?.criticalEvidence.statusBasis,
    "A privacy notice was retained, but CertScore did not verify a consumer rights request method in this scan context."
  );
});

test("California accepts Ad Choices as CPRA sale-share path only with CPRA context", () => {
  const outcomes = deriveCaliforniaPrivacyCoveragePolicyOutcomes({
    coverageLimited: false,
    runtimeArtifacts: {
      californiaPrivacyEvidence: {
        privacyNoticeObserved: true,
        privacyNoticeUrls: ["https://example.test/privacy"],
        verifiedPrivacyNoticeUrls: ["https://example.test/privacy"],
        collectionContextObserved: false,
        targetedAdvertisingSignalsObserved: true,
        directAdvertisingSharingVendors: ["Example Ads"],
        doNotSellSharePathObserved: true,
        doNotSellSharePathLabel: "Ad Choices",
        doNotSellSharePathUrl: "https://example.test/ad-choices",
        policySaleShareAdmissionObserved: true,
        policySaleShareAdmissionConfidence: "high",
        policySaleShareAdmissionSnippet: "We may share personal information for targeted advertising.",
        gpcTestRan: false,
        policyRuntimeDisclosureAlignment: "review",
        sensitivePiContextObserved: false,
        consumerRightsRequestMethodObserved: true,
        consumerRightsRequestMethodUrls: ["https://example.test/privacy-request"],
        consumerRightsRequestMethodTypes: ["web_form"],
        privacyControlAccessibilityIssueObserved: null
      }
    },
    scanCompleted: true
  });

  assert.equal(outcomes.do_not_sell_share_availability?.status, "observed");
  assert.equal(
    outcomes.do_not_sell_share_availability?.criticalEvidence.retainedEvidence.cpraSaleShareOptOutPathLabel,
    "Ad Choices"
  );
});

test("California first-party retail media evidence is review signal, not third-party targeted advertising", () => {
  const outcomes = deriveCaliforniaPrivacyCoveragePolicyOutcomes({
    coverageLimited: true,
    runtimeArtifacts: {
      californiaPrivacyEvidence: {
        privacyNoticeObserved: null,
        collectionContextObserved: false,
        targetedAdvertisingSignalsObserved: false,
        directAdvertisingSharingVendors: [],
        firstPartyRetailMediaSignalsObserved: true,
        firstPartyRetailMediaScriptNames: ["ads_core", "sponsored-products-tracking", "fire-pixel"],
        firstPartyRetailMediaRequestUrls: ["https://www.example-retail.test/ads_core.js"],
        doNotSellSharePathObserved: false,
        gpcTestRan: false,
        policyRuntimeDisclosureAlignment: "not_testable",
        sensitivePiContextObserved: false,
        consumerRightsRequestMethodObserved: false,
        privacyControlAccessibilityIssueObserved: null
      }
    },
    scanCompleted: true
  });

  assert.equal(outcomes.targeted_advertising_signals?.status, "review_signal");
  assert.match(outcomes.targeted_advertising_signals?.limitation ?? "", /First-party retail media/);
  assert.equal(outcomes.do_not_sell_share_availability?.status, "not_applicable");
});

test("California GPC handling is not applicable without sale/share applicability", () => {
  const outcomes = deriveCaliforniaPrivacyCoveragePolicyOutcomes({
    coverageLimited: false,
    runtimeArtifacts: {
      californiaPrivacyEvidence: {
        privacyNoticeObserved: true,
        privacyNoticeUrls: ["https://example.test/privacy"],
        verifiedPrivacyNoticeUrls: ["https://example.test/privacy"],
        collectionContextObserved: false,
        targetedAdvertisingSignalsObserved: false,
        directAdvertisingSharingVendors: [],
        analyticsTagManagementVendors: ["Google Tag Manager"],
        doNotSellSharePathObserved: false,
        gpcTestRan: true,
        gpcSignalSent: true,
        gpcRecognitionObserved: null,
        sensitivePiContextObserved: false
      }
    },
    scanCompleted: true
  });

  assert.equal(outcomes.targeted_advertising_signals?.status, "not_observed");
  assert.equal(outcomes.do_not_sell_share_availability?.status, "not_applicable");
  assert.equal(outcomes.gpc_opt_out_signal_handling?.status, "not_applicable");
});

test("California GPC handling keeps mismatched vendor labels out of runtime basis", () => {
  const outcomes = deriveCaliforniaPrivacyCoveragePolicyOutcomes({
    coverageLimited: false,
    runtimeArtifacts: {
      californiaPrivacyEvidence: {
        privacyNoticeObserved: true,
        privacyNoticeUrls: ["https://fyc.appletv.com/privacy"],
        verifiedPrivacyNoticeUrls: ["https://fyc.appletv.com/privacy"],
        collectionContextObserved: false,
        targetedAdvertisingSignalsObserved: true,
        advertisingSharingVendors: ["Meta Pixel"],
        directSaleShareOrTargetedAdvertisingVendors: ["Meta Pixel"],
        saleShareRequestUrls: [
          "https://tv.apple.com/assets/translations~hahH3Z_59v.js",
          "https://tv.apple.com/includes/js-cdn/musickit/v3/components/musickit-components/locales/en-us/translations.json"
        ],
        directSaleShareOrTargetedAdvertisingRequestUrls: [
          "https://tv.apple.com/assets/translations~hahH3Z_59v.js",
          "https://tv.apple.com/includes/js-cdn/musickit/v3/components/musickit-components/locales/en-us/translations.json"
        ],
        doNotSellSharePathObserved: false,
        gpcTestRan: true,
        gpcSignalSent: true,
        gpcRecognitionObserved: false,
        sensitivePiContextObserved: false
      },
      gpcVerification: {
        status: "ignored",
        evidenceUrls: [
          "https://tv.apple.com/assets/translations~hahH3Z_59v.js",
          "https://tv.apple.com/includes/js-cdn/musickit/v3/components/musickit-components/locales/en-us/translations.json"
        ],
        gpcSignalSent: true,
        gpcScanStateSent: true,
        gpcRequestHeadersApplied: true,
        gpcTrackerCount: 1,
        gpcEvidenceTrackerVendors: ["Meta Pixel"],
        trackerCountDelta: 0,
        thirdPartyCookieCountDelta: 0
      }
    },
    scanCompleted: true
  });

  assert.equal(outcomes.targeted_advertising_signals?.status, "not_observed");
  assert.equal(
    outcomes.targeted_advertising_signals?.criticalEvidence.statusBasis,
    "A possible advertising-sharing vendor label was retained, but request URLs did not verify qualifying third-party targeted-advertising runtime evidence."
  );
  assert.equal(outcomes.do_not_sell_share_availability?.status, "not_observed");
  assert.equal(outcomes.gpc_opt_out_signal_handling?.status, "not_observed");
  assert.equal(
    outcomes.gpc_opt_out_signal_handling?.criticalEvidence.statusBasis,
    "A GPC signal was sent, but the retained tracker vendor label did not match the GPC evidence request URLs; CertScore did not verify a GPC handling gap in the tested context."
  );
  assert.deepEqual(
    outcomes.gpc_opt_out_signal_handling?.criticalEvidence.retainedEvidence.gpcEvidenceTrackerVendorLabelsRetained,
    ["Meta Pixel"]
  );
  assert.equal("gpcEvidenceTrackerVendors" in (outcomes.gpc_opt_out_signal_handling?.criticalEvidence.retainedEvidence ?? {}), false);
  assert.deepEqual(
    outcomes.gpc_opt_out_signal_handling?.criticalEvidence.retainedEvidence.unmatchedGpcEvidenceTrackerVendorLabels,
    ["Meta Pixel"]
  );
  assert.equal(
    outcomes.gpc_opt_out_signal_handling?.criticalEvidence.retainedEvidence.gpcRuntimeVendorRequestUrlCoherence,
    "mismatch"
  );
});

test("California GPC handling treats skipped retained GPC objects as not testable", () => {
  const outcomes = deriveCaliforniaPrivacyCoveragePolicyOutcomes({
    coverageLimited: false,
    runtimeArtifacts: {
      californiaPrivacyEvidence: {
        privacyNoticeObserved: true,
        privacyNoticeUrls: ["https://example.test/privacy"],
        verifiedPrivacyNoticeUrls: ["https://example.test/privacy"],
        collectionContextObserved: false,
        targetedAdvertisingSignalsObserved: true,
        directAdvertisingSharingVendors: ["Meta Pixel"],
        advertisingSharingVendors: ["Meta Pixel"],
        saleShareRequestUrls: ["https://connect.facebook.net/en_US/fbevents.js"],
        doNotSellSharePathObserved: false,
        sensitivePiContextObserved: false
      },
      gpcVerification: {
        status: "inconclusive",
        baselineTrackerCount: 1,
        baselineThirdPartyCookieCount: 0,
        gpcTrackerCount: 0,
        gpcThirdPartyCookieCount: null,
        gpcSignalSent: false,
        gpcScanStateSent: false,
        gpcRequestHeadersApplied: false,
        gpcHandlingObserved: "not_determined",
        gpcHandlingBasis: ["gpc_verification_skipped"],
        trackerCountDelta: null,
        thirdPartyCookieCountDelta: null,
        evidenceUrls: []
      }
    },
    scanCompleted: true
  });

  assert.equal(outcomes.gpc_opt_out_signal_handling?.status, "not_testable");
  assert.equal(outcomes.gpc_opt_out_signal_handling?.criticalEvidence.retainedEvidence.gpcTestRan, false);
  assert.equal(outcomes.gpc_opt_out_signal_handling?.criticalEvidence.retainedEvidence.gpcSignalSent, false);
  assert.deepEqual(
    outcomes.gpc_opt_out_signal_handling?.criticalEvidence.missingOrIncompleteSourceSignals?.map((signal) => signal.field),
    ["californiaPrivacyEvidence.gpcTestRan"]
  );
});

test("deriveCaliforniaPrivacyCoveragePolicyOutcomes keeps unattempted privacy notice candidates behind needs evidence", () => {
  const outcomes = deriveCaliforniaPrivacyCoveragePolicyOutcomes({
    coverageLimited: false,
    runtimeArtifacts: {
      californiaPrivacyEvidence: {
        privacyNoticeObserved: false,
        privacyNoticeCandidateUrls: ["https://www.gotrust.nl/privacy-policy"],
        privacyNoticeDiscoveryEvidence: {
          attempted: true,
          attemptedPrivacyNoticeUrls: ["https://gotrust.nl/privacy"],
          attemptedUrls: ["https://gotrust.nl/privacy", "https://gotrust.nl/terms"],
          blockedUrls: [],
          failedUrls: ["https://gotrust.nl/privacy", "https://gotrust.nl/terms"],
          homepageCandidateCount: 0,
          homepageFetchStatus: "ok",
          legalHubCandidateCount: 0,
          legalHubFetchStatus: null,
          legalHubTargetCount: 0,
          legalHubUrl: null,
          privacyTargetAttempted: true,
          privacyTargetVerified: false,
          source: "passive_public_surface_verification",
          usedUrlscanBackfill: true,
          verifiedPrivacyNoticeUrls: [],
          verifiedSurfaceTargets: []
        },
        californiaNoticeCueObserved: false,
        collectionContextObserved: false
      }
    },
    scanCompleted: true
  });

  assert.equal(outcomes.privacy_notice_availability?.status, "not_testable");
  assert.match(outcomes.privacy_notice_availability?.criticalEvidence.statusBasis ?? "", /discovery was incomplete/i);
  assert.deepEqual(
    outcomes.privacy_notice_availability?.criticalEvidence.retainedEvidence.privacyNoticeUnattemptedCandidateUrls,
    ["https://www.gotrust.nl/privacy-policy"]
  );
  assert.equal(
    outcomes.privacy_notice_availability?.criticalEvidence.missingOrIncompleteSourceSignals[0]?.field,
    "californiaPrivacyEvidence.privacyNoticeCandidateUrls"
  );
});

test("California cohort regression keeps limited guessed-only legal recovery as upstream evidence gap", () => {
  const outcomes = deriveCaliforniaPrivacyCoveragePolicyOutcomes({
    coverageLimited: true,
    runtimeArtifacts: {
      californiaPrivacyEvidence: {
        privacyNoticeObserved: false,
        privacyNoticeUrls: [],
        verifiedPrivacyNoticeUrls: [],
        privacyNoticeAttemptedUrls: [
          "https://example-retail.test/privacy",
          "https://example-retail.test/legal/privacy-policy"
        ],
        privacyNoticeDiscoveryEvidence: {
          attempted: true,
          attemptedPrivacyNoticeUrls: [
            "https://example-retail.test/privacy",
            "https://example-retail.test/legal/privacy-policy"
          ],
          failedUrls: [
            "https://example-retail.test/privacy",
            "https://example-retail.test/legal/privacy-policy"
          ],
          blockedUrls: [],
          homepageCandidateCount: 0,
          legalHubCandidateCount: 0,
          privacyTargetAttempted: true,
          privacyTargetVerified: false,
          usedUrlscanBackfill: true,
          verifiedPrivacyNoticeUrls: []
        },
        collectionContextObserved: false,
        targetedAdvertisingSignalsObserved: false,
        directAdvertisingSharingVendors: [],
        analyticsTagManagementVendors: [],
        doNotSellSharePathObserved: false,
        privacyChoicePathEvidence: {
          attempted: true,
          observed: false,
          candidateCount: 0,
          selectionBasis: "none",
          limitation: "discovery_only"
        },
        gpcTestRan: false,
        sensitivePiContextObserved: false,
        consumerRightsRequestMethodObserved: false,
        rightsLanguageObserved: false
      }
    },
    scanCompleted: true
  });

  assert.equal(outcomes.privacy_notice_availability?.status, "potential_gap");
  assert.equal(outcomes.notice_at_collection?.status, "not_observed");
  assert.equal(outcomes.targeted_advertising_signals?.status, "not_observed");
  assert.equal(outcomes.do_not_sell_share_availability?.status, "not_applicable");
  assert.equal(outcomes.gpc_opt_out_signal_handling?.status, "not_testable");
  assert.equal(
    outcomes.privacy_notice_availability?.criticalEvidence.retainedEvidence.privacyTargetVerified,
    false
  );
});

test("California rights methods reject generic footer contact context", () => {
  const outcomes = deriveCaliforniaPrivacyCoveragePolicyOutcomes({
    coverageLimited: false,
    runtimeArtifacts: {
      californiaPrivacyEvidence: {
        privacyNoticeObserved: true,
        privacyNoticeUrls: ["https://example.edu/privacy"],
        verifiedPrivacyNoticeUrls: ["https://example.edu/privacy"],
        consumerRightsRequestMethodObserved: false,
        consumerRightsRequestMethodUrls: [],
        consumerRightsRequestMethodTypes: [],
        consumerRightsRequestMethodSnippets: [],
        rightsLanguageObserved: true,
        evidenceRefs: ["Footer Contact Us / address retained as generic context"]
      }
    },
    scanCompleted: true
  });

  assert.equal(outcomes.consumer_rights_request_methods?.status, "review_signal");
  assert.equal(
    outcomes.consumer_rights_request_methods?.criticalEvidence.retainedEvidence.consumerRightsRequestMethodObserved,
    false
  );
  assert.deepEqual(
    outcomes.consumer_rights_request_methods?.criticalEvidence.retainedEvidence.consumerRightsRequestMethodTypes ?? [],
    []
  );
});

test("California consumer rights methods are checked when retained privacy notice search finds no rights language or method", () => {
  const outcomes = deriveCaliforniaPrivacyCoveragePolicyOutcomes({
    coverageLimited: false,
    runtimeArtifacts: {
      californiaPrivacyEvidence: {
        privacyNoticeObserved: true,
        privacyNoticeUrls: ["https://example.test/privacy"],
        verifiedPrivacyNoticeUrls: ["https://example.test/privacy"],
        consumerRightsRequestMethodObserved: false,
        consumerRightsRequestMethodUrls: [],
        consumerRightsRequestMethodTypes: [],
        consumerRightsRequestMethodSnippets: [],
        consumerRightsRequestMethodDeepSearchConfirmed: true,
        rightsRequestMethodDeepSearchConfirmed: true,
        rightsLanguageObserved: false
      }
    },
    scanCompleted: true
  });

  assert.equal(outcomes.consumer_rights_request_methods?.status, "not_observed");
  assert.equal(
    outcomes.consumer_rights_request_methods?.criticalEvidence.statusBasis,
    "A verified privacy notice context was retained and searched, but no consumer rights request method was observed in this scan context."
  );
  assert.equal(
    outcomes.consumer_rights_request_methods?.criticalEvidence.retainedEvidence.rightsMethodDeepSearchConfirmed,
    true
  );
});

test("California consumer rights methods become a gap signal when rights language is retained but no method is found after deep search", () => {
  const outcomes = deriveCaliforniaPrivacyCoveragePolicyOutcomes({
    coverageLimited: false,
    runtimeArtifacts: {
      californiaPrivacyEvidence: {
        privacyNoticeObserved: true,
        privacyNoticeUrls: ["https://example.test/privacy"],
        verifiedPrivacyNoticeUrls: ["https://example.test/privacy"],
        consumerRightsRequestMethodObserved: false,
        consumerRightsRequestMethodUrls: [],
        consumerRightsRequestMethodTypes: [],
        consumerRightsRequestMethodSnippets: [],
        consumerRightsRequestMethodDeepSearchConfirmed: true,
        rightsRequestMethodDeepSearchConfirmed: true,
        rightsLanguageObserved: true
      }
    },
    scanCompleted: true
  });

  assert.equal(outcomes.consumer_rights_request_methods?.status, "potential_gap");
  assert.equal(
    outcomes.consumer_rights_request_methods?.criticalEvidence.statusBasis,
    "Consumer rights language was retained in a verified privacy notice context, but no usable consumer rights request method was observed after a retained method search."
  );
  assert.equal(
    outcomes.consumer_rights_request_methods?.criticalEvidence.retainedEvidence.rightsLanguageObserved,
    true
  );
});

test("California DNSR availability gaps on direct adtech when no privacy choice path is retained", () => {
  const outcomes = deriveCaliforniaPrivacyCoveragePolicyOutcomes({
    coverageLimited: false,
    runtimeArtifacts: {
      californiaPrivacyEvidence: {
        targetedAdvertisingSignalsObserved: true,
        directSaleShareOrTargetedAdvertisingVendors: ["Meta Pixel"],
        directSaleShareOrTargetedAdvertisingRequestUrls: ["https://connect.facebook.net/en_US/fbevents.js"],
        directSaleShareOrTargetedAdvertisingCookieNames: ["_fbp"],
        analyticsOrMeasurementVendors: ["Google Analytics"],
        doNotSellSharePathObserved: false
      }
    },
    scanCompleted: true
  });

  assert.equal(outcomes.do_not_sell_share_availability?.status, "potential_gap");
  assert.deepEqual(
    outcomes.do_not_sell_share_availability?.criticalEvidence.retainedEvidence.advertisingSharingVendors,
    ["Meta Pixel"]
  );
  assert.deepEqual(
    outcomes.do_not_sell_share_availability?.criticalEvidence.retainedEvidence.saleShareRequestUrls,
    ["https://connect.facebook.net/en_US/fbevents.js"]
  );
});

test("California DNSR availability uses verified policy sale-share admission without runtime adtech", () => {
  const outcomes = deriveCaliforniaPrivacyCoveragePolicyOutcomes({
    coverageLimited: false,
    runtimeArtifacts: {
      californiaPrivacyEvidence: {
        targetedAdvertisingSignalsObserved: false,
        analyticsOrMeasurementVendors: ["Google Tag Manager"],
        policySaleShareAdmissionObserved: true,
        policySaleShareAdmissionSnippet: "We may share personal information for cross-context behavioral advertising.",
        policySaleShareAdmissionConfidence: "high",
        doNotSellSharePathObserved: false
      }
    },
    scanCompleted: true
  });

  assert.equal(outcomes.do_not_sell_share_availability?.status, "potential_gap");
  assert.equal(
    outcomes.do_not_sell_share_availability?.criticalEvidence.retainedEvidence.policySaleShareAdmissionObserved,
    true
  );
});

test("California DNSR availability keeps softer policy admission language below applicability", () => {
  const outcomes = deriveCaliforniaPrivacyCoveragePolicyOutcomes({
    coverageLimited: false,
    runtimeArtifacts: {
      californiaPrivacyEvidence: {
        targetedAdvertisingSignalsObserved: false,
        policySaleShareAdmissionObserved: true,
        policySaleShareAdmissionSnippet: "We work with advertising partners.",
        policySaleShareAdmissionConfidence: "moderate",
        doNotSellSharePathObserved: false
      }
    },
    scanCompleted: true
  });

  assert.equal(outcomes.do_not_sell_share_availability?.status, "not_applicable");
  assert.equal(outcomes.sale_share_disclosure_alignment?.status, "not_applicable");
});

test("California calibration handles NBC-like direct adtech without confirmed opt-out interaction", () => {
  const outcomes = deriveCaliforniaPrivacyCoveragePolicyOutcomes({
    coverageLimited: false,
    runtimeArtifacts: {
      californiaPrivacyEvidence: {
        privacyNoticeObserved: true,
        privacyNoticeUrls: ["https://example.test/privacy"],
        verifiedPrivacyNoticeUrls: ["https://example.test/privacy"],
        collectionContextObserved: false,
        targetedAdvertisingSignalsObserved: true,
        directAdvertisingSharingVendors: ["Meta Pixel", "Google Ads"],
        saleShareRequestUrls: [
          "https://connect.facebook.net/en_US/fbevents.js",
          "https://googleads.g.doubleclick.net/pagead/id"
        ],
        doNotSellSharePathObserved: true,
        doNotSellSharePathUrl: "https://example.test/privacy/choices",
        privacyChoicePathEvidence: {
          attempted: true,
          observed: true,
          selectedUrl: "https://example.test/privacy/choices",
          selectedLabel: "Your Privacy Choices",
          selectionBasis: "privacy_choice_link",
          limitation: "discovery_only"
        },
        optOutInteractionConfirmed: false,
        postOptOutTrackingReductionObserved: null,
        postOptOutTrackingPersisted: null,
        gpcTestRan: false,
        consumerRightsRequestMethodObserved: false,
        consumerRightsRequestMethodUrls: [],
        rightsLanguageObserved: false,
        sensitivePiContextObserved: false
      }
    },
    scanCompleted: true
  });

  assert.equal(outcomes.targeted_advertising_signals?.status, "observed");
  assert.equal(outcomes.do_not_sell_share_availability?.status, "observed");
  assert.equal(outcomes.post_opt_out_tracking_behavior?.status, "not_testable");
  assert.equal(outcomes.gpc_opt_out_signal_handling?.status, "not_testable");
  assert.equal(outcomes.consumer_rights_request_methods?.status, "review_signal");
  assert.equal(outcomes.sensitive_forms_third_party_tracking?.status, "not_observed");
});

test("California calibration handles LA-Times-like footer notice and direct adtech as observed evidence", () => {
  const outcomes = deriveCaliforniaPrivacyCoveragePolicyOutcomes({
    coverageLimited: false,
    runtimeArtifacts: {
      californiaPrivacyEvidence: {
        privacyNoticeObserved: true,
        privacyNoticeUrls: ["https://example.test/privacy"],
        verifiedPrivacyNoticeUrls: ["https://example.test/privacy"],
        collectionContextObserved: false,
        collectionNoticeEvidenceKind: "footer_notice_link_only",
        footerNoticeCueObserved: true,
        footerNoticeCueText: "CA Notice at Collection",
        targetedAdvertisingSignalsObserved: true,
        directAdvertisingSharingVendors: ["The Trade Desk"],
        saleShareRequestUrls: ["https://pixel.adsrvr.org/track"],
        doNotSellSharePathObserved: true,
        doNotSellSharePathUrl: "https://example.test/privacy/choices",
        privacyChoicePathEvidence: {
          attempted: true,
          observed: true,
          selectedUrl: "https://example.test/privacy/choices",
          selectedLabel: "Your Privacy Choices",
          selectionBasis: "privacy_choice_link",
          limitation: "discovery_only"
        },
        optOutInteractionConfirmed: null,
        gpcTestRan: false,
        sensitivePiContextObserved: false
      }
    },
    scanCompleted: true
  });

  assert.equal(outcomes.notice_at_collection?.status, "review_signal");
  assert.equal(
    outcomes.notice_at_collection?.criticalEvidence.statusBasis,
    "Notice surface was retained, but no point-of-collection context was tested."
  );
  assert.deepEqual(
    outcomes.targeted_advertising_signals?.criticalEvidence.retainedEvidence.advertisingSharingVendors,
    ["The Trade Desk"]
  );
  assert.equal(outcomes.targeted_advertising_signals?.status, "observed");
  assert.equal(outcomes.do_not_sell_share_availability?.status, "observed");
  assert.equal(outcomes.post_opt_out_tracking_behavior?.status, "not_testable");
  assert.equal(outcomes.gpc_opt_out_signal_handling?.status, "not_testable");
});

test("California calibration observes NVIDIA-like confirmed opt-out reduction only with retained comparison evidence", () => {
  const outcomes = deriveCaliforniaPrivacyCoveragePolicyOutcomes({
    coverageLimited: false,
    runtimeArtifacts: {
      californiaPrivacyEvidence: {
        privacyNoticeObserved: true,
        privacyNoticeUrls: ["https://example.test/privacy"],
        verifiedPrivacyNoticeUrls: ["https://example.test/privacy"],
        collectionContextObserved: false,
        targetedAdvertisingSignalsObserved: true,
        directAdvertisingSharingVendors: ["LinkedIn Insight Tag", "Google Ads"],
        saleShareRequestUrls: [
          "https://px.ads.linkedin.com/collect",
          "https://googleads.g.doubleclick.net/pagead/id"
        ],
        doNotSellSharePathObserved: true,
        doNotSellSharePathUrl: "https://example.test/privacy-center",
        privacyChoicePathEvidence: {
          attempted: true,
          observed: true,
          selectedUrl: "https://example.test/privacy-center",
          selectedLabel: "Privacy Center",
          selectionBasis: "privacy_choice_link",
          interactionAttempted: true,
          interactionConfirmed: true,
          interactionOutcome: "opened_preference_center",
          limitation: "interaction_attempted"
        },
        privacyChoiceInteractionEvidence: {
          attempted: true,
          pathObserved: true,
          selectedUrl: "https://example.test/privacy-center",
          selectedLabel: "Privacy Center",
          clickConfirmed: true,
          outcome: "opened_preference_center",
          beforeTrackerCount: 4,
          afterTrackerCount: 1,
          removedTrackerVendors: ["LinkedIn Insight Tag", "Google Ads"],
          persistedTrackerVendors: [],
          evidenceUrls: ["https://example.test/privacy-center"]
        },
        optOutInteractionConfirmed: true,
        optOutSavedOrApplied: true,
        postOptOutTrackingReductionObserved: true,
        postOptOutTrackingPersisted: false,
        postOptOutPersistedVendors: [],
        postOptOutPersistedDirectAdvertisingVendors: [],
        postOptOutDirectAdvertisingRequestUrls: [],
        postOptOutDirectAdvertisingPersisted: false,
        gpcTestRan: false,
        sensitivePiContextObserved: false
      }
    },
    scanCompleted: true
  });

  assert.deepEqual(
    outcomes.targeted_advertising_signals?.criticalEvidence.retainedEvidence.advertisingSharingVendors,
    ["LinkedIn Insight Tag", "Google Ads"]
  );
  assert.equal(outcomes.targeted_advertising_signals?.status, "observed");
  assert.equal(outcomes.do_not_sell_share_availability?.status, "observed");
  assert.equal(outcomes.post_opt_out_tracking_behavior?.status, "observed");
  assert.equal(outcomes.gpc_opt_out_signal_handling?.status, "not_testable");
  assert.equal(outcomes.notice_at_collection?.status, "review_signal");
});

test("California post-opt-out behavior does not observe reduction from opened preference center alone", () => {
  const outcomes = deriveCaliforniaPrivacyCoveragePolicyOutcomes({
    coverageLimited: false,
    runtimeArtifacts: {
      californiaPrivacyEvidence: {
        targetedAdvertisingSignalsObserved: true,
        directAdvertisingSharingVendors: ["LinkedIn Insight Tag"],
        doNotSellSharePathObserved: true,
        privacyChoicePathEvidence: {
          attempted: true,
          observed: true,
          selectedUrl: "https://example.test/privacy-center",
          selectedLabel: "Privacy Center",
          selectionBasis: "privacy_choice_link",
          interactionAttempted: true,
          interactionConfirmed: true,
          interactionOutcome: "opened_preference_center",
          limitation: "interaction_attempted"
        },
        privacyChoiceInteractionEvidence: {
          attempted: true,
          pathObserved: true,
          selectedUrl: "https://example.test/privacy-center",
          selectedLabel: "Privacy Center",
          clickConfirmed: true,
          outcome: "opened_preference_center",
          beforeTrackerCount: 4,
          afterTrackerCount: 4,
          persistedTrackerVendors: ["LinkedIn Insight Tag"],
          evidenceUrls: ["https://example.test/privacy-center"]
        },
        optOutInteractionConfirmed: true,
        optOutSavedOrApplied: false,
        postOptOutTrackingReductionObserved: null,
        postOptOutTrackingPersisted: null,
        postOptOutDirectAdvertisingPersisted: null
      }
    },
    scanCompleted: true
  });

  assert.equal(outcomes.post_opt_out_tracking_behavior?.status, "not_testable");
});

test("California calibration keeps homepage-self privacy choice candidates in review", () => {
  const outcomes = deriveCaliforniaPrivacyCoveragePolicyOutcomes({
    coverageLimited: false,
    runtimeArtifacts: {
      californiaPrivacyEvidence: {
        targetedAdvertisingSignalsObserved: true,
        directAdvertisingSharingVendors: ["Meta Pixel"],
        doNotSellSharePathObserved: true,
        doNotSellSharePathUrl: "https://example.test/",
        privacyChoicePathEvidence: {
          attempted: true,
          observed: true,
          selectedUrl: "https://example.test/",
          selectedLabel: "Your Privacy Choices",
          selectionBasis: "homepage_self_unconfirmed",
          interactionConfirmed: false,
          limitation: "discovery_only"
        }
      }
    },
    scanCompleted: true
  });

  assert.equal(outcomes.do_not_sell_share_availability?.status, "review_signal");
});

test("California disclosure alignment treats vendor-specific unmatched evidence as review", () => {
  const outcomes = deriveCaliforniaPrivacyCoveragePolicyOutcomes({
    coverageLimited: false,
    runtimeArtifacts: {
      californiaPrivacyEvidence: {
        targetedAdvertisingSignalsObserved: true,
        directAdvertisingSharingVendors: ["Meta Pixel"],
        saleShareRequestUrls: ["https://connect.facebook.net/en_US/fbevents.js"],
        policyRuntimeDisclosureAlignment: "gap_observed",
        policyRuntimeDisclosureAlignmentBasis: "vendor_specific_unmatched",
        policyRuntimeDisclosureSnippets: ["We disclose personal information for targeted advertising."],
        unmatchedRuntimeDisclosureVendors: ["Meta Pixel"]
      }
    },
    scanCompleted: true
  });

  assert.equal(outcomes.sale_share_disclosure_alignment?.status, "review_signal");
});

test("California disclosure alignment is not applicable without direct runtime sale-share vendors", () => {
  const outcomes = deriveCaliforniaPrivacyCoveragePolicyOutcomes({
    coverageLimited: false,
    runtimeArtifacts: {
      californiaPrivacyEvidence: {
        targetedAdvertisingSignalsObserved: false,
        saleShareApplicabilityObserved: true,
        policySaleShareAdmissionObserved: true,
        policySaleShareAdmissionConfidence: "high",
        policySaleShareAdmissionSnippet: "We may sell or share personal information for cross-context behavioral advertising.",
        directAdvertisingSharingVendors: [],
        saleShareRequestUrls: [],
        analyticsTagManagementVendors: ["Google Tag Manager", "Segment"],
        policyRuntimeDisclosureAlignment: "review"
      }
    },
    scanCompleted: true
  });

  assert.equal(outcomes.targeted_advertising_signals?.status, "review_signal");
  assert.equal(outcomes.sale_share_disclosure_alignment?.status, "not_applicable");
});

test("California disclosure alignment keeps no category disclosure as a potential gap", () => {
  const outcomes = deriveCaliforniaPrivacyCoveragePolicyOutcomes({
    coverageLimited: false,
    runtimeArtifacts: {
      californiaPrivacyEvidence: {
        targetedAdvertisingSignalsObserved: true,
        directAdvertisingSharingVendors: ["Meta Pixel"],
        saleShareRequestUrls: ["https://connect.facebook.net/en_US/fbevents.js"],
        policyRuntimeDisclosureAlignment: "gap_observed",
        policyRuntimeDisclosureAlignmentBasis: "potential_gap_no_category_disclosure",
        policyRuntimeDisclosureSnippets: [],
        unmatchedRuntimeDisclosureVendors: ["Meta Pixel"]
      }
    },
    scanCompleted: true
  });

  assert.equal(outcomes.sale_share_disclosure_alignment?.status, "potential_gap");
});

test("California post-opt-out tracking is not testable when the opt-out was opened but not saved", () => {
  const outcomes = deriveCaliforniaPrivacyCoveragePolicyOutcomes({
    coverageLimited: false,
    runtimeArtifacts: {
      californiaPrivacyEvidence: {
        targetedAdvertisingSignalsObserved: true,
        directAdvertisingSharingVendors: ["Meta Pixel"],
        doNotSellSharePathObserved: true,
        privacyChoiceInteractionEvidence: {
          beforeTrackerCount: 2,
          afterTrackerCount: 2,
          persistedTrackerVendors: ["Meta Pixel"]
        },
        optOutInteractionConfirmed: true,
        optOutSavedOrApplied: false,
        postOptOutTrackingPersisted: true,
        postOptOutDirectAdvertisingPersisted: true,
        postOptOutPersistedDirectAdvertisingVendors: ["Meta Pixel"],
        postOptOutDirectAdvertisingRequestUrls: ["https://connect.facebook.net/en_US/fbevents.js"]
      }
    },
    scanCompleted: true
  });

  assert.equal(outcomes.post_opt_out_tracking_behavior?.status, "not_testable");
});

test("California privacy control accessibility distinguishes absent controls from untested accessibility", () => {
  const noControlOutcomes = deriveCaliforniaPrivacyCoveragePolicyOutcomes({
    coverageLimited: false,
    runtimeArtifacts: {
      californiaPrivacyEvidence: {
        privacyControlObserved: false,
        privacyControlAccessibilityIssueObserved: null
      }
    },
    scanCompleted: true
  });
  assert.equal(noControlOutcomes.privacy_control_accessibility?.status, "not_applicable");
  assert.equal(noControlOutcomes.privacy_control_accessibility?.criticalEvidence.statusBasis, "Control not observed.");

  const missingSignalOutcomes = deriveCaliforniaPrivacyCoveragePolicyOutcomes({
    coverageLimited: false,
    runtimeArtifacts: {
      californiaPrivacyEvidence: {
        privacyControlObserved: true,
        privacyControlAccessibilityIssueObserved: null
      }
    },
    scanCompleted: true
  });
  assert.equal(missingSignalOutcomes.privacy_control_accessibility?.status, "not_testable");
});

test("California CIPA rows project only retained CIPA-sensitive evidence as risk signals", () => {
  const outcomes = deriveCaliforniaPrivacyCoveragePolicyOutcomes({
    coverageLimited: false,
    runtimeArtifacts: {
      californiaPrivacyEvidence: {
        cipaCommunicationInterceptionEvidence: {
          cipaConsentTiming: "unknown",
          cipaDisclosureObserved: false,
          cipaEvidenceConfidence: "low",
          cipaSensitive: true,
          cipaSensitiveSurfaceObserved: false,
          cipaSignalTypes: ["form_interaction", "pixel_on_sensitive_surface"],
          cipaThirdPartyReceiptObserved: false,
          directEvidenceObserved: false,
          legalConclusion: false,
          pageUrls: ["https://example.test/contact"],
          requestUrls: ["https://analytics.example.test/collect"],
          vendors: ["Example Analytics"]
        },
        cipaInteractionRecordingEvidence: {
          cipaConsentTiming: "pre_consent",
          cipaDisclosureObserved: false,
          cipaEvidenceConfidence: "high",
          cipaSensitive: true,
          cipaSensitiveSurfaceObserved: true,
          cipaSignalTypes: ["session_replay", "third_party_interaction_endpoint"],
          cipaThirdPartyReceiptObserved: true,
          collectionEndpointObserved: true,
          directEvidenceObserved: true,
          legalConclusion: false,
          pageUrls: ["https://example.test/intake"],
          requestUrls: ["https://rs.fullstory.com/rec/page"],
          vendors: ["FullStory"]
        }
      }
    },
    scanCompleted: true
  });

  assert.equal(outcomes.cipa_sensitive_interaction_recording?.status, "observed");
  assert.equal(outcomes.cipa_sensitive_interaction_recording?.criticalEvidence.evidenceFamily, "cipa_interaction_recording");
  assert.equal(
    outcomes.cipa_sensitive_interaction_recording?.criticalEvidence.retainedEvidence.legalConclusion,
    false
  );
  assert.equal(outcomes.targeted_advertising_signals?.status, "not_testable");
  assert.equal(outcomes.targeted_advertising_signals?.criticalEvidence.retainedEvidence.cipaRiskOverlay, undefined);
  assert.equal(outcomes.sensitive_forms_third_party_tracking?.status, "not_testable");
  assert.equal(outcomes.sensitive_forms_third_party_tracking?.criticalEvidence.retainedEvidence.cipaRiskOverlay, undefined);
  assert.equal(outcomes.sale_share_disclosure_alignment?.status, "not_testable");
  assert.equal(outcomes.sale_share_disclosure_alignment?.criticalEvidence.retainedEvidence.cipaRiskOverlay, undefined);
  assert.equal(outcomes.cipa_sensitive_communication_interception?.status, "review_signal");
  assert.equal(
    outcomes.cipa_sensitive_communication_interception?.criticalEvidence.retainedEvidence.directEvidenceObserved,
    false
  );
});

test("deriveCaliforniaPrivacyCoveragePolicyOutcomes marks every row not testable when no California evidence is retained", () => {
  const outcomes = deriveCaliforniaPrivacyCoveragePolicyOutcomes({
    coverageLimited: true,
    runtimeArtifacts: null,
    scanCompleted: true
  });

  assert.equal(Object.keys(outcomes).length, 14);
  assert.equal(Object.values(outcomes).every((outcome) => outcome.status === "not_testable"), true);
  assert.equal(
    Object.values(outcomes).every((outcome) => outcome.criticalEvidence.retainedEvidence.coverageLimited === true),
    true
  );
  assert.equal(
    Object.values(outcomes).every((outcome) =>
      outcome.criticalEvidence.missingOrIncompleteSourceSignals.some((gap) => gap.field === "scanner.publicWebCoverage")
    ),
    true
  );
});

test("CIPA negative retained evidence is not observed only when public coverage is usable", () => {
  const runtimeArtifacts = {
    californiaPrivacyEvidence: {
      cipaRuntimeCoverageEvidence: {
        attempted: true,
        chatSupportVendorObserved: false,
        collectionFieldContextCount: 0,
        communicationPageCount: 0,
        inspectedSurfaceTypes: ["request_purpose_classification", "runtime_script_inventory"],
        limitation: "runtime_surface_inspected",
        preSubmitProbeAttempted: true,
        requestPurposeClassificationRowCount: 0,
        scriptTagCount: 3,
        sourceSignals: ["requestPurposeClassificationConfidence"],
        sufficientForNegativeCipaReview: true,
        thirdPartyRequestCount: 2,
        trackerVendorCount: 0
      },
      cipaCommunicationInterceptionEvidence: {
        cipaConsentTiming: "unknown",
        cipaDisclosureObserved: false,
        cipaEvidenceConfidence: "high",
        cipaSensitive: false,
        cipaSensitiveSurfaceObserved: false,
        cipaSignalTypes: [],
        cipaThirdPartyReceiptObserved: false,
        directEvidenceObserved: false,
        legalConclusion: false,
        pageUrls: [],
        requestUrls: [],
        vendors: []
      },
      cipaInteractionRecordingEvidence: {
        cipaConsentTiming: "unknown",
        cipaDisclosureObserved: false,
        cipaEvidenceConfidence: "high",
        cipaSensitive: false,
        cipaSensitiveSurfaceObserved: false,
        cipaSignalTypes: [],
        cipaThirdPartyReceiptObserved: false,
        directEvidenceObserved: false,
        legalConclusion: false,
        pageUrls: [],
        requestUrls: [],
        vendors: []
      }
    }
  };

  const usableCoverageOutcomes = deriveCaliforniaPrivacyCoveragePolicyOutcomes({
    coverageLimited: false,
    runtimeArtifacts,
    scanCompleted: true
  });
  assert.equal(usableCoverageOutcomes.cipa_sensitive_interaction_recording?.status, "not_observed");
  assert.equal(usableCoverageOutcomes.cipa_sensitive_communication_interception?.status, "not_observed");
  assert.equal(
    usableCoverageOutcomes.cipa_sensitive_interaction_recording?.criticalEvidence.retainedEvidence.legalConclusion,
    false
  );

  const limitedCoverageOutcomes = deriveCaliforniaPrivacyCoveragePolicyOutcomes({
    coverageLimited: true,
    runtimeArtifacts,
    scanCompleted: true
  });
  assert.equal(limitedCoverageOutcomes.cipa_sensitive_interaction_recording?.status, "not_testable");
  assert.equal(limitedCoverageOutcomes.cipa_sensitive_communication_interception?.status, "review_signal");
  assert.equal(
    limitedCoverageOutcomes.cipa_sensitive_communication_interception?.criticalEvidence.statusBasis,
    "No direct chat or pre-submit interception evidence was retained, but runtime coverage was limited; treat this as an incomplete negative review."
  );

  const insufficientCipaCoverageOutcomes = deriveCaliforniaPrivacyCoveragePolicyOutcomes({
    coverageLimited: true,
    runtimeArtifacts: {
      californiaPrivacyEvidence: {
        ...runtimeArtifacts.californiaPrivacyEvidence,
        cipaRuntimeCoverageEvidence: {
          ...runtimeArtifacts.californiaPrivacyEvidence.cipaRuntimeCoverageEvidence,
          limitation: "blocked_or_challenge",
          sufficientForNegativeCipaReview: false
        }
      }
    },
    scanCompleted: true
  });
  assert.equal(insufficientCipaCoverageOutcomes.cipa_sensitive_interaction_recording?.status, "not_testable");
  assert.equal(insufficientCipaCoverageOutcomes.cipa_sensitive_communication_interception?.status, "review_signal");
  assert.equal(
    insufficientCipaCoverageOutcomes.cipa_sensitive_interaction_recording?.criticalEvidence.missingOrIncompleteSourceSignals.some(
      (gap) => gap.field === "californiaPrivacyEvidence.cipaRuntimeCoverageEvidence.sufficientForNegativeCipaReview"
    ),
    true
  );
});

test("California decisive row postures retain self-sufficient reviewer evidence", () => {
  const outcomes = deriveCaliforniaPrivacyCoveragePolicyOutcomes({
    coverageLimited: false,
    runtimeArtifacts: CALIFORNIA_PRIVACY_RUNTIME_ARTIFACT_FIXTURES.evidenceRichReviewSignal,
    scanCompleted: true
  });

  assert.deepEqual(
    outcomes.privacy_notice_availability?.criticalEvidence.retainedEvidence.privacyNoticeUrls,
    ["https://example.test/privacy"]
  );
  assert.deepEqual(
    outcomes.notice_at_collection?.criticalEvidence.retainedEvidence.collectionContextUrls,
    ["https://example.test/newsletter"]
  );
  assert.deepEqual(
    outcomes.do_not_sell_share_availability?.criticalEvidence.retainedEvidence.advertisingSharingVendors,
    ["Example Ads", "Meta Pixel"]
  );
  assert.deepEqual(
    outcomes.do_not_sell_share_availability?.criticalEvidence.retainedEvidence.privacyChoiceSearchUrls,
    ["https://example.test/privacy"]
  );
  assert.equal(outcomes.gpc_opt_out_signal_handling?.criticalEvidence.retainedEvidence.gpcStatus, "ignored");
  assert.equal(outcomes.gpc_opt_out_signal_handling?.criticalEvidence.retainedEvidence.trackerCountDelta, 1);
  assert.deepEqual(
    outcomes.sale_share_disclosure_alignment?.criticalEvidence.retainedEvidence.policyRuntimeDisclosureSnippets,
    ["We may disclose personal information for targeted advertising and analytics."]
  );
  assert.deepEqual(
    outcomes.limit_use_sensitive_pi?.criticalEvidence.retainedEvidence.sensitivePiContextUrls,
    ["https://example.test/checkout"]
  );
  assert.deepEqual(
    outcomes.sensitive_forms_third_party_tracking?.criticalEvidence.retainedEvidence.sensitiveThirdPartyTrackingVendors,
    ["Meta Pixel"]
  );
  assert.deepEqual(
    outcomes.consumer_rights_request_methods?.criticalEvidence.retainedEvidence.rightsRequestMethodSnippets,
    ["Submit a privacy request to access, delete, or correct your personal information."]
  );
});
