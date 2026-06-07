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
  assert.equal(outcomes.notice_at_collection?.status, "not_observed");
  assert.equal(outcomes.do_not_sell_share_availability?.status, "potential_gap");
  assert.equal(outcomes.gpc_opt_out_signal_handling?.status, "potential_gap");
  assert.equal(outcomes.targeted_advertising_signals?.status, "review_signal");
  assert.equal(outcomes.limit_use_sensitive_pi?.status, "not_applicable");
  assert.equal(outcomes.post_opt_out_tracking_behavior?.status, "not_testable");
  assert.equal(outcomes.consumer_rights_request_methods?.status, "observed");
  assert.equal(outcomes.consumer_rights_request_methods?.criticalEvidence.evidenceFamily, "rights_methods");
  assert.equal(
    outcomes.do_not_sell_share_availability?.criticalEvidence.pipeline.regulatoryReviewArea,
    "california_ccpa_cpra"
  );
});

test("deriveCaliforniaPrivacyCoveragePolicyOutcomes treats unconfirmed privacy-choice interaction as reviewable evidence", () => {
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

  assert.equal(outcomes.opt_out_friction_dark_patterns?.status, "review_signal");
  assert.equal(outcomes.post_opt_out_tracking_behavior?.status, "review_signal");
  assert.equal(
    outcomes.post_opt_out_tracking_behavior?.criticalEvidence.retainedEvidence.privacyChoiceInteractionEvidence,
    outcomes.opt_out_friction_dark_patterns?.criticalEvidence.retainedEvidence.privacyChoiceInteractionEvidence
  );
  assert.equal(
    outcomes.post_opt_out_tracking_behavior?.criticalEvidence.missingOrIncompleteSourceSignals.length,
    0
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

  assert.equal(outcomes.limit_use_sensitive_pi?.status, "review_signal");
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
        doNotSellSharePathObserved: false,
        optOutInteractionConfirmed: false,
        postOptOutTrackingReductionObserved: null,
        postOptOutTrackingPersisted: null
      }
    },
    scanCompleted: true
  });

  assert.equal(outcomes.opt_out_friction_dark_patterns?.status, "not_applicable");
  assert.equal(outcomes.post_opt_out_tracking_behavior?.status, "not_testable");
  assert.equal(
    outcomes.post_opt_out_tracking_behavior?.criticalEvidence.missingOrIncompleteSourceSignals[0]?.field,
    "californiaPrivacyEvidence.optOutInteractionConfirmed"
  );
});

test("deriveCaliforniaPrivacyCoveragePolicyOutcomes treats retained no-path search as no post-opt-out behavior observed", () => {
  const outcomes = deriveCaliforniaPrivacyCoveragePolicyOutcomes({
    coverageLimited: false,
    runtimeArtifacts: {
      californiaPrivacyEvidence: {
        targetedAdvertisingSignalsObserved: true,
        advertisingSharingVendors: ["Example Ads"],
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
  assert.equal(outcomes.opt_out_friction_dark_patterns?.status, "review_signal");
  assert.equal(outcomes.post_opt_out_tracking_behavior?.status, "not_observed");
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

  assert.equal(outcomes.do_not_sell_share_availability?.status, "potential_gap");
  assert.equal(
    outcomes.do_not_sell_share_availability?.criticalEvidence.retainedEvidence.targetedAdvertisingSignalsObserved,
    true
  );
  assert.equal(outcomes.do_not_sell_share_availability?.criticalEvidence.retainedEvidence.doNotSellSharePathObserved, false);
  assert.deepEqual(outcomes.do_not_sell_share_availability?.criticalEvidence.retainedEvidence.advertisingSharingVendors, ["Meta"]);
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

  assert.equal(outcomes.privacy_notice_availability?.status, "review_signal");
  assert.equal(outcomes.notice_at_collection?.status, "not_observed");
  assert.equal(outcomes.targeted_advertising_signals?.status, "review_signal");
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

  assert.equal(outcomes.targeted_advertising_signals?.status, "review_signal");
  assert.match(outcomes.targeted_advertising_signals?.limitation ?? "", /Analytics or tag-management/i);
  assert.equal(outcomes.do_not_sell_share_availability?.status, "not_applicable");
  assert.notEqual(outcomes.do_not_sell_share_availability?.status, "potential_gap");
  assert.equal(outcomes.post_opt_out_tracking_behavior?.status, "not_testable");
  assert.equal(outcomes.gpc_opt_out_signal_handling?.status, "not_testable");
  assert.deepEqual(
    outcomes.do_not_sell_share_availability?.criticalEvidence.retainedEvidence.advertisingSharingVendors ?? [],
    []
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
        saleShareRequestUrls: ["https://connect.facebook.net/en_US/fbevents.js"],
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

  assert.equal(outcomes.targeted_advertising_signals?.status, "review_signal");
  assert.equal(outcomes.do_not_sell_share_availability?.status, "observed");
  assert.equal(outcomes.post_opt_out_tracking_behavior?.status, "not_testable");
  assert.equal(outcomes.gpc_opt_out_signal_handling?.status, "not_testable");
  assert.equal(outcomes.consumer_rights_request_methods?.status, "not_observed");
  assert.equal(outcomes.sensitive_forms_third_party_tracking?.status, "not_observed");
});

test("California calibration handles LA-Times-like footer notice and direct adtech as review evidence", () => {
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
  assert.deepEqual(
    outcomes.targeted_advertising_signals?.criticalEvidence.retainedEvidence.advertisingSharingVendors,
    ["The Trade Desk"]
  );
  assert.equal(outcomes.targeted_advertising_signals?.status, "review_signal");
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
  assert.equal(outcomes.targeted_advertising_signals?.status, "review_signal");
  assert.equal(outcomes.do_not_sell_share_availability?.status, "observed");
  assert.equal(outcomes.post_opt_out_tracking_behavior?.status, "observed");
  assert.equal(outcomes.gpc_opt_out_signal_handling?.status, "not_testable");
  assert.equal(outcomes.notice_at_collection?.status, "not_observed");
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

  assert.equal(outcomes.post_opt_out_tracking_behavior?.status, "review_signal");
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

test("California post-opt-out tracking stays review when the opt-out was opened but not saved", () => {
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

  assert.equal(outcomes.post_opt_out_tracking_behavior?.status, "review_signal");
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

  assert.equal(outcomes.cipa_sensitive_interaction_recording?.status, "potential_gap");
  assert.equal(outcomes.cipa_sensitive_interaction_recording?.criticalEvidence.evidenceFamily, "cipa_interaction_recording");
  assert.equal(
    outcomes.cipa_sensitive_interaction_recording?.criticalEvidence.retainedEvidence.legalConclusion,
    false
  );
  assert.equal(outcomes.targeted_advertising_signals?.status, "not_testable");
  assert.deepEqual(
    (outcomes.targeted_advertising_signals?.criticalEvidence.retainedEvidence.cipaRiskOverlay as { overlayTags?: string[] } | undefined)?.overlayTags,
    [
      "pre_consent_tracking",
      "session_replay_or_behavioral_analytics",
      "cross_domain_or_interaction_event_sharing"
    ]
  );
  assert.equal(outcomes.sensitive_forms_third_party_tracking?.status, "not_testable");
  assert.equal(
    (outcomes.sensitive_forms_third_party_tracking?.criticalEvidence.retainedEvidence.cipaRiskOverlay as { legalConclusion?: boolean } | undefined)?.legalConclusion,
    false
  );
  assert.equal(outcomes.sale_share_disclosure_alignment?.status, "not_testable");
  assert.deepEqual(
    (outcomes.sale_share_disclosure_alignment?.criticalEvidence.retainedEvidence.cipaRiskOverlay as { overlayTags?: string[] } | undefined)?.overlayTags,
    ["cookie_vendor_disclosure_gap", "cross_domain_or_interaction_event_sharing"]
  );
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
