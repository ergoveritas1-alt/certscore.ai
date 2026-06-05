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

test("deriveCaliforniaPrivacyCoveragePolicyOutcomes reads DB-backed snake_case California runtime evidence", () => {
  const outcomes = deriveCaliforniaPrivacyCoveragePolicyOutcomes({
    coverageLimited: false,
    runtimeArtifacts: {
      california_privacy_evidence: {
        privacyNoticeObserved: true,
        privacyNoticeUrls: ["https://example.test/privacy"],
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

test("deriveCaliforniaPrivacyCoveragePolicyOutcomes marks every row not testable when no California evidence is retained", () => {
  const outcomes = deriveCaliforniaPrivacyCoveragePolicyOutcomes({
    coverageLimited: true,
    runtimeArtifacts: null,
    scanCompleted: true
  });

  assert.equal(Object.keys(outcomes).length, 12);
  assert.equal(Object.values(outcomes).every((outcome) => outcome.status === "not_testable"), true);
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
    ["Example Ads", "Meta Pixel", "connect.facebook.net"]
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
