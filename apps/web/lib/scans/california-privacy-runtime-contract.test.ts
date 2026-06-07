import assert from "node:assert/strict";
import test from "node:test";

import {
  CALIFORNIA_PRIVACY_RUNTIME_ARTIFACT_FIXTURES,
  CALIFORNIA_PRIVACY_RUNTIME_ARTIFACT_REQUIRED_KEYS
} from "../../../../packages/shared/src/regulatory-review/california-privacy-runtime-fixtures";
import { deriveCaliforniaPrivacyCoverageChecklist } from "./california-privacy-coverage-checklist";
import { deriveCaliforniaPrivacyCoveragePolicyOutcomes } from "./california-privacy-coverage-policy";
import { deriveHighRiskTrackingContext } from "./high-risk-tracking-context";
import { buildNormalizedConcerns } from "./normalized-concerns";
import {
  buildUnifiedFindingDisplayPackets,
  buildUnifiedFindingPackets,
  type UnifiedFindingPacket
} from "./unified-findings";

function getPacket(packets: UnifiedFindingPacket[], findingId: string) {
  const packet = packets.find((candidate) => candidate.unifiedFindingId === findingId);
  assert.ok(packet, `Expected unified finding packet ${findingId}`);
  return packet;
}

function getChecklistRow(items: ReturnType<typeof deriveCaliforniaPrivacyCoverageChecklist>, rowId: string) {
  const row = items.find((candidate) => candidate.id === rowId);
  assert.ok(row, `Expected California checklist row ${rowId}`);
  return row;
}

function deriveChecklistFromRuntimeArtifacts(runtimeArtifacts: Record<string, unknown>, coverageLimited = false) {
  const unifiedFindings = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [],
    runtimeArtifacts,
    validationFindingLookup: new Map(),
    validationFindings: []
  });
  const coverageOutcomes = deriveCaliforniaPrivacyCoveragePolicyOutcomes({
    coverageLimited,
    normalizedConcerns: buildNormalizedConcerns({
      reviewFindingCandidates: [],
      runtimeArtifacts,
      validationFindings: []
    }),
    runtimeArtifacts,
    scanCompleted: true
  });

  return {
    checklist: deriveCaliforniaPrivacyCoverageChecklist({
      coverageLimited,
      coverageOutcomes,
      scanCompleted: true,
      unifiedFindings
    }),
    coverageOutcomes,
    unifiedFindings
  };
}

test("California runtime contract fixtures expose the expected top-level WS01 packet keys", () => {
  for (const fixture of Object.values(CALIFORNIA_PRIVACY_RUNTIME_ARTIFACT_FIXTURES)) {
    for (const key of CALIFORNIA_PRIVACY_RUNTIME_ARTIFACT_REQUIRED_KEYS) {
      assert.equal(Object.prototype.hasOwnProperty.call(fixture, key), true, `Expected fixture to retain ${key}`);
    }
  }
});

test("California evidence-rich runtime fixture flows through canonical concerns and unified findings", () => {
  const runtimeArtifacts = CALIFORNIA_PRIVACY_RUNTIME_ARTIFACT_FIXTURES.evidenceRichReviewSignal;
  const concerns = buildNormalizedConcerns({
    reviewFindingCandidates: [],
    runtimeArtifacts,
    validationFindings: []
  });
  const packets = buildUnifiedFindingPackets({
    reviewFindingCandidates: [],
    runtimeArtifacts,
    validationFindings: []
  });

  const concernFindingIds = new Set(concerns.flatMap((concern) => concern.suggestedUnifiedFindingId ?? []));
  const packetFindingIds = new Set(packets.map((packet) => packet.unifiedFindingId));

  assert.equal(concernFindingIds.has("cpra_cba_opt_out_missing"), true);
  assert.equal(concernFindingIds.has("gpc_signal_not_honored"), true);
  assert.equal(concernFindingIds.has("privacy_rights_path_present"), true);
  assert.equal(concernFindingIds.has("sensitive_data_collection_with_third_party_tracking_present"), true);

  assert.equal(packetFindingIds.has("cpra_cba_opt_out_missing"), true);
  assert.equal(packetFindingIds.has("gpc_signal_not_honored"), true);
  assert.equal(packetFindingIds.has("privacy_rights_path_present"), true);
});

test("California observed-controls fixture creates positive controls without absence-driven findings", () => {
  const runtimeArtifacts = CALIFORNIA_PRIVACY_RUNTIME_ARTIFACT_FIXTURES.observedControlsOnly;
  const packets = buildUnifiedFindingPackets({
    reviewFindingCandidates: [],
    runtimeArtifacts,
    validationFindings: []
  });
  const packetFindingIds = new Set(packets.map((packet) => packet.unifiedFindingId));

  assert.equal(packetFindingIds.has("targeted_advertising_choices_present"), true);
  assert.equal(packetFindingIds.has("privacy_rights_path_present"), true);
  assert.equal(packetFindingIds.has("cpra_cba_opt_out_missing"), false);
  assert.equal(packetFindingIds.has("gpc_signal_not_honored"), false);
});

test("California runtime contract fixture projects conservative machine-status coverage rows", () => {
  const outcomes = deriveCaliforniaPrivacyCoveragePolicyOutcomes({
    coverageLimited: false,
    runtimeArtifacts: CALIFORNIA_PRIVACY_RUNTIME_ARTIFACT_FIXTURES.evidenceRichReviewSignal,
    scanCompleted: true
  });

  assert.equal(outcomes.privacy_notice_availability?.status, "observed");
  assert.equal(outcomes.notice_at_collection?.status, "observed");
  assert.equal(outcomes.do_not_sell_share_availability?.status, "potential_gap");
  assert.equal(outcomes.gpc_opt_out_signal_handling?.status, "potential_gap");
  assert.equal(outcomes.consumer_rights_request_methods?.status, "observed");
  assert.equal(outcomes.do_not_sell_share_availability?.criticalEvidence.evidenceFamily, "sale_share_control");
});

test("California-derived unified findings retain self-sufficient advanced evidence", () => {
  const packets = buildUnifiedFindingPackets({
    reviewFindingCandidates: [],
    runtimeArtifacts: CALIFORNIA_PRIVACY_RUNTIME_ARTIFACT_FIXTURES.evidenceRichReviewSignal,
    validationFindings: []
  });

  const cpraPacket = getPacket(packets, "cpra_cba_opt_out_missing");
  assert.deepEqual(cpraPacket.evidence?.entities?.advertisingSharingVendors, [
    "Example Ads",
    "Meta Pixel"
  ]);
  assert.deepEqual(cpraPacket.evidence?.entities?.privacyChoiceSearchUrls, ["https://example.test/privacy"]);
  assert.deepEqual(cpraPacket.evidence?.entities?.optOutUiResult, ["absent"]);
  assert.deepEqual(cpraPacket.evidence?.entities?.choiceControlsInspected, ["true"]);
  assert.deepEqual(cpraPacket.evidence?.entities?.policyCbaLanguage, ["full_cba_language"]);
  assert.deepEqual(cpraPacket.evidence?.entities?.scanOriginGeo, ["US-CA"]);

  const gpcPacket = getPacket(packets, "gpc_signal_not_honored");
  assert.equal(gpcPacket.evidence?.counts?.trackerCountDelta, 1);
  assert.equal(gpcPacket.evidence?.counts?.thirdPartyCookieCountDelta, 1);
  assert.deepEqual(gpcPacket.evidence?.entities?.gpcStatus, ["ignored"]);
  assert.deepEqual(gpcPacket.evidence?.entities?.gpcSignalSent, ["true"]);
  assert.deepEqual(gpcPacket.evidence?.entities?.gpcRecognitionObserved, ["false"]);
  assert.deepEqual(gpcPacket.evidence?.entities?.gpcPolicyMentions, [
    "We honor Global Privacy Control opt-out preference signals."
  ]);

  const rightsPacket = getPacket(packets, "privacy_rights_path_present");
  assert.deepEqual(rightsPacket.evidence?.entities?.consumerRightsRequestMethodUrls, [
    "https://example.test/privacy-request"
  ]);
  assert.deepEqual(rightsPacket.evidence?.entities?.consumerRightsRequestMethodTypes, [
    "access_request",
    "delete_request",
    "correction_request"
  ]);
  assert.deepEqual(rightsPacket.evidence?.snippets, [
    "Submit a privacy request to access, delete, or correct your personal information."
  ]);

  const sensitivePacket = getPacket(packets, "sensitive_data_collection_with_third_party_tracking_present");
  assert.deepEqual(sensitivePacket.evidence?.entities?.sensitivePiCategories, ["financial_information"]);
  assert.deepEqual(sensitivePacket.evidence?.entities?.sensitivePiContextUrls, ["https://example.test/checkout"]);
  assert.deepEqual(sensitivePacket.evidence?.entities?.sensitiveThirdPartyTrackingVendors, ["Meta Pixel"]);
  assert.deepEqual(sensitivePacket.evidence?.entities?.sensitiveThirdPartyTrackingRequestUrls, [
    "https://connect.facebook.net/tr"
  ]);
});

test("California observed-controls unified finding retains choice-path evidence", () => {
  const packets = buildUnifiedFindingPackets({
    reviewFindingCandidates: [],
    runtimeArtifacts: CALIFORNIA_PRIVACY_RUNTIME_ARTIFACT_FIXTURES.observedControlsOnly,
    validationFindings: []
  });
  const choicesPacket = getPacket(packets, "targeted_advertising_choices_present");

  assert.deepEqual(choicesPacket.evidence?.entities?.doNotSellSharePathObserved, ["true"]);
  assert.deepEqual(choicesPacket.evidence?.entities?.doNotSellSharePathLabel, ["Your Privacy Choices"]);
  assert.deepEqual(choicesPacket.evidence?.entities?.doNotSellSharePathUrl, [
    "https://example.test/privacy/choices"
  ]);
  assert.deepEqual(choicesPacket.evidence?.pageUrls, ["https://example.test/privacy/choices"]);
});

test("WS01-shaped California runtime artifact remains self-sufficient through checklist projection", () => {
  const runtimeArtifacts = CALIFORNIA_PRIVACY_RUNTIME_ARTIFACT_FIXTURES.evidenceRichReviewSignal;
  const unifiedFindings = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [],
    runtimeArtifacts,
    validationFindingLookup: new Map(),
    validationFindings: []
  });
  const coverageOutcomes = deriveCaliforniaPrivacyCoveragePolicyOutcomes({
    coverageLimited: false,
    runtimeArtifacts,
    scanCompleted: true
  });
  const checklist = deriveCaliforniaPrivacyCoverageChecklist({
    coverageLimited: false,
    coverageOutcomes,
    scanCompleted: true,
    unifiedFindings
  });

  const optOutRow = getChecklistRow(checklist, "do_not_sell_share_availability");
  assert.equal(optOutRow.status, "potential_gap");
  assert.equal(optOutRow.criticalEvidence.pipeline.projectionStage, "coverage_policy");
  assert.equal(optOutRow.criticalEvidence.retainedEvidence.cpraOptOutUiResult, "absent");
  assert.deepEqual(optOutRow.criticalEvidence.retainedEvidence.advertisingSharingVendors, [
    "Example Ads",
    "Meta Pixel"
  ]);
  assert.deepEqual(optOutRow.criticalEvidence.retainedEvidence.privacyChoiceSearchUrls, [
    "https://example.test/privacy"
  ]);
  assert.equal(optOutRow.criticalEvidence.retainedEvidence.choiceControlsInspected, true);
  assert.equal(optOutRow.criticalEvidence.retainedEvidence.scanOriginGeo, "US-CA");

  const gpcRow = getChecklistRow(checklist, "gpc_opt_out_signal_handling");
  assert.equal(gpcRow.status, "potential_gap");
  assert.equal(gpcRow.criticalEvidence.retainedEvidence.gpcStatus, "ignored");
  assert.equal(gpcRow.criticalEvidence.retainedEvidence.gpcSignalSent, true);
  assert.equal(gpcRow.criticalEvidence.retainedEvidence.gpcRecognitionObserved, false);
  assert.equal(gpcRow.criticalEvidence.retainedEvidence.trackerCountDelta, 1);
  assert.equal(gpcRow.criticalEvidence.retainedEvidence.thirdPartyCookieCountDelta, 1);
  assert.deepEqual(gpcRow.criticalEvidence.retainedEvidence.policyMentions, [
    "We honor Global Privacy Control opt-out preference signals."
  ]);

  const sensitiveRow = getChecklistRow(checklist, "sensitive_forms_third_party_tracking");
  assert.equal(sensitiveRow.status, "review_signal");
  assert.deepEqual(sensitiveRow.criticalEvidence.retainedEvidence.sensitivePiCategories, [
    "financial_information"
  ]);
  assert.deepEqual(sensitiveRow.criticalEvidence.retainedEvidence.sensitivePiContextUrls, [
    "https://example.test/checkout"
  ]);
  assert.deepEqual(sensitiveRow.criticalEvidence.retainedEvidence.sensitiveThirdPartyTrackingVendors, [
    "Meta Pixel"
  ]);
  assert.deepEqual(sensitiveRow.criticalEvidence.retainedEvidence.sensitiveThirdPartyTrackingRequestUrls, [
    "https://connect.facebook.net/tr"
  ]);

  const rightsRow = getChecklistRow(checklist, "consumer_rights_request_methods");
  assert.equal(rightsRow.status, "observed");
  assert.deepEqual(rightsRow.criticalEvidence.retainedEvidence.consumerRightsRequestMethodUrls, [
    "https://example.test/privacy-request"
  ]);
  assert.deepEqual(rightsRow.criticalEvidence.retainedEvidence.consumerRightsRequestMethodTypes, [
    "access_request",
    "delete_request",
    "correction_request"
  ]);
  assert.deepEqual(rightsRow.criticalEvidence.retainedEvidence.consumerRightsRequestMethodSnippets, [
    "Submit a privacy request to access, delete, or correct your personal information."
  ]);
});

test("California cohort generic search/footer/contact signals stay negative through canonical rows", () => {
  const runtimeArtifacts = {
    californiaPrivacyEvidence: {
      collectionContextObserved: false,
      collectionContextTypes: ["generic_site_search"],
      collectionContextUrls: ["https://example.edu/search?q=privacy"],
      collectionEvidenceSources: ["site_search_input"],
      collectionFieldContexts: [{ fieldName: "q", inputType: "search", surfaceType: "generic_site_search" }],
      collectionNoticeCueObserved: false,
      collectionNoticeEvidenceKind: "generic_search_only",
      consumerRightsRequestMethodObserved: false,
      consumerRightsRequestMethodSnippets: [],
      consumerRightsRequestMethodTypes: [],
      consumerRightsRequestMethodUrls: [],
      evidenceRefs: ["Generic site search input q", "Footer Contact Us link"],
      footerNoticeCueObserved: true,
      footerNoticeCueText: "California Notice",
      privacyNoticeObserved: true,
      privacyNoticeUrls: ["https://example.edu/privacy"],
      rightsLanguageObserved: true,
      targetedAdvertisingSignalsObserved: false,
      verifiedPrivacyNoticeUrls: ["https://example.edu/privacy"]
    }
  };

  assert.equal(
    (runtimeArtifacts.californiaPrivacyEvidence.collectionFieldContexts[0] as Record<string, unknown>).surfaceType,
    "generic_site_search"
  );
  assert.equal(runtimeArtifacts.californiaPrivacyEvidence.footerNoticeCueObserved, true);
  assert.equal(runtimeArtifacts.californiaPrivacyEvidence.consumerRightsRequestMethodObserved, false);

  const concerns = buildNormalizedConcerns({
    reviewFindingCandidates: [],
    runtimeArtifacts,
    validationFindings: []
  });
  assert.equal(
    concerns.some((concern) => concern.originKey === "california_privacy.collection_notice.potential_gap"),
    false
  );
  assert.equal(
    concerns.some((concern) => concern.suggestedUnifiedFindingId === "policy_clarity_risk"),
    false
  );
  assert.equal(
    concerns.some((concern) => concern.suggestedUnifiedFindingId === "privacy_rights_path_present"),
    false
  );
  assert.equal(
    concerns.some((concern) => concern.originKey === "california_privacy.rights_methods.observed"),
    false
  );

  const { checklist, coverageOutcomes } = deriveChecklistFromRuntimeArtifacts(runtimeArtifacts);
  assert.equal(coverageOutcomes.notice_at_collection?.status, "not_observed");
  assert.equal(coverageOutcomes.consumer_rights_request_methods?.status, "review_signal");

  const collectionRow = getChecklistRow(checklist, "notice_at_collection");
  assert.equal(collectionRow.status, "not_observed");
  assert.equal(collectionRow.criticalEvidence.pipeline.projectionStage, "coverage_policy");
  assert.equal(collectionRow.criticalEvidence.retainedEvidence.collectionNoticeEvidenceKind, "generic_search_only");
  assert.equal(collectionRow.note, "Only a generic site search collection surface was retained; no eligible point-of-collection context was observed.");
  assert.doesNotMatch(collectionRow.note, /point-of-collection notice was retained/i);

  const rightsRow = getChecklistRow(checklist, "consumer_rights_request_methods");
  assert.equal(rightsRow.status, "review_signal");
  assert.equal(rightsRow.criticalEvidence.retainedEvidence.consumerRightsRequestMethodObserved, false);
  assert.deepEqual(rightsRow.criticalEvidence.retainedEvidence.consumerRightsRequestMethodUrls ?? [], []);
  assert.equal(rightsRow.note, "A privacy notice was retained, but CertScore did not verify a consumer rights request method in this scan context.");
});

test("California collection sweep contract projects completed no-context sweep without review signal", () => {
  const runtimeArtifacts = {
    californiaPrivacyEvidence: {
      collectionContextObserved: false,
      collectionContextUrls: [],
      collectionNoticeCueObserved: null,
      collectionNoticeEvidenceKind: "policy_notice_text_only",
      collectionSurfaceSearchAttempted: true,
      collectionSurfaceCandidateUrls: ["https://tv.apple.com/contact"],
      collectionSurfaceVisitedUrls: ["https://tv.apple.com/contact"],
      collectionSurfaceBlockedUrls: [],
      pointOfCollectionContextTested: true,
      collectionContextNegativeReviewSufficient: true,
      collectionContextCoverageLimitation: "bounded_sweep_no_collection_context",
      consumerRightsRequestMethodObserved: false,
      privacyNoticeObserved: true,
      privacyNoticeUrls: ["https://tv.apple.com/legal/privacy"],
      rightsLanguageObserved: false,
      targetedAdvertisingSignalsObserved: false,
      verifiedPrivacyNoticeUrls: ["https://tv.apple.com/legal/privacy"]
    }
  };

  const { checklist, coverageOutcomes } = deriveChecklistFromRuntimeArtifacts(runtimeArtifacts);

  assert.equal(coverageOutcomes.notice_at_collection?.status, "not_applicable");
  const collectionRow = getChecklistRow(checklist, "notice_at_collection");
  assert.equal(collectionRow.status, "not_applicable");
  assert.equal(collectionRow.note, "Bounded collection-surface sweep did not retain an eligible point-of-collection context.");
  assert.equal(collectionRow.criticalEvidence.retainedEvidence.collectionContextNegativeReviewSufficient, true);
});

test("California cohort CMP infrastructure remains attribution context, not direct adtech evidence", () => {
  const runtimeArtifacts = {
    californiaPrivacyEvidence: {
      analyticsOrMeasurementRequestUrls: ["https://www.googletagmanager.com/gtm.js?id=GTM-TEST"],
      analyticsOrMeasurementVendors: ["Google Tag Manager"],
      analyticsTagManagementVendors: ["Google Tag Manager"],
      directAdvertisingSharingVendors: [],
      directSaleShareOrTargetedAdvertisingRequestUrls: [],
      directSaleShareOrTargetedAdvertisingVendors: [],
      doNotSellSharePathObserved: false,
      evidenceRefs: ["OneTrust CMP script", "Google Tag Manager script"],
      privacyNoticeObserved: true,
      privacyNoticeUrls: ["https://example.test/privacy"],
      saleShareRequestUrls: [],
      targetedAdvertisingSignalsObserved: false,
      utilityOrInfrastructureRequestUrls: ["https://cdn.cookielaw.org/scripttemplates/otSDKStub.js"],
      verifiedPrivacyNoticeUrls: ["https://example.test/privacy"]
    },
    thirdPartyRequestDomains: ["cdn.cookielaw.org", "www.googletagmanager.com"],
    thirdPartyRequestUrls: [
      "https://cdn.cookielaw.org/scripttemplates/otSDKStub.js",
      "https://www.googletagmanager.com/gtm.js?id=GTM-TEST"
    ]
  };

  const highRiskContext = deriveHighRiskTrackingContext({
    evidenceUrls: runtimeArtifacts.thirdPartyRequestUrls,
    hostname: "example.test",
    runtimeArtifacts,
    thirdPartyDomains: runtimeArtifacts.thirdPartyRequestDomains
  });
  assert.ok(highRiskContext.cmpVendors.some((vendor) => vendor.name === "OneTrust"));
  assert.equal(highRiskContext.highRiskVendors.some((vendor) => vendor.name === "OneTrust"), false);
  assert.deepEqual(runtimeArtifacts.californiaPrivacyEvidence.directAdvertisingSharingVendors, []);
  assert.deepEqual(runtimeArtifacts.californiaPrivacyEvidence.utilityOrInfrastructureRequestUrls, [
    "https://cdn.cookielaw.org/scripttemplates/otSDKStub.js"
  ]);

  const concerns = buildNormalizedConcerns({
    reviewFindingCandidates: [],
    runtimeArtifacts,
    validationFindings: []
  });
  assert.equal(
    concerns.some((concern) => concern.originKey === "california_privacy.sale_share_control.potential_gap"),
    false
  );
  assert.equal(
    concerns.some((concern) => concern.suggestedUnifiedFindingId === "sale_sharing_controls_missing"),
    false
  );
  assert.equal(
    concerns.some((concern) => concern.suggestedUnifiedFindingId === "cpra_cba_opt_out_missing"),
    false
  );

  const { checklist, coverageOutcomes } = deriveChecklistFromRuntimeArtifacts(runtimeArtifacts);
  assert.equal(coverageOutcomes.targeted_advertising_signals?.status, "not_observed");
  assert.equal(coverageOutcomes.do_not_sell_share_availability?.status, "not_applicable");

  const targetedRow = getChecklistRow(checklist, "targeted_advertising_signals");
  assert.equal(targetedRow.status, "not_observed");
  assert.deepEqual(targetedRow.criticalEvidence.retainedEvidence.advertisingSharingVendors ?? [], []);
  assert.deepEqual(targetedRow.criticalEvidence.retainedEvidence.analyticsTagManagementVendors, [
    "Google Tag Manager"
  ]);
  assert.match(targetedRow.note, /No eligible targeted advertising/i);

  const optOutRow = getChecklistRow(checklist, "do_not_sell_share_availability");
  assert.equal(optOutRow.status, "not_applicable");
  assert.equal(optOutRow.criticalEvidence.retainedEvidence.saleShareApplicabilityObserved, false);
  assert.deepEqual(optOutRow.criticalEvidence.retainedEvidence.advertisingSharingVendors ?? [], []);
  assert.match(optOutRow.note, /No direct sale\/share, targeted-advertising, or high-confidence policy sale\/share admission evidence/i);
});

test("California sale/share gap requires vendor request URL coherence for Apple-style personalized ads context", () => {
  const runtimeArtifacts = {
    californiaPrivacyEvidence: {
      advertisingSharingVendors: ["Meta Pixel"],
      directAdvertisingSharingVendors: ["Meta Pixel"],
      doNotSellSharePathObserved: false,
      evidenceRefs: ["Policy personalized ads language", "Apple translation asset request"],
      policySaleShareAdmissionConfidence: "high",
      policySaleShareAdmissionObserved: true,
      policySaleShareAdmissionSnippet:
        "Apple-delivered advertising helps people discover apps, products, and services while respecting user privacy. Personalized Ads may appear in Apple apps.",
      privacyNoticeObserved: true,
      privacyNoticeUrls: ["https://www.apple.com/legal/privacy/"],
      saleShareRequestUrls: [
        "https://tv.apple.com/assets/translation/en-US.json",
        "https://tv.apple.com/assets/musickit/musickit.js"
      ],
      targetedAdvertisingSignalsObserved: true
    },
    cpraCbaOptOutEvidence: {
      advertisingSharingVendors: ["Meta Pixel"],
      choiceControlsInspected: true,
      optOutControlFound: false,
      optOutUiResult: "absent",
      policyCbaLanguage: "personalized_ads_context",
      privacyChoiceSearchUrls: ["https://tv.apple.com/"]
    }
  };

  const concerns = buildNormalizedConcerns({
    reviewFindingCandidates: [],
    runtimeArtifacts,
    validationFindings: []
  });
  assert.equal(
    concerns.some((concern) => concern.suggestedUnifiedFindingId === "sale_sharing_controls_missing"),
    false
  );
  assert.equal(
    concerns.some((concern) => concern.suggestedUnifiedFindingId === "cpra_cba_opt_out_missing"),
    false
  );

  const unifiedFindings = buildUnifiedFindingPackets({
    reviewFindingCandidates: [],
    runtimeArtifacts,
    validationFindings: []
  });
  assert.equal(
    unifiedFindings.some((packet) => packet.unifiedFindingId === "sale_sharing_controls_missing"),
    false
  );
  assert.equal(
    unifiedFindings.some((packet) => packet.unifiedFindingId === "cpra_cba_opt_out_missing"),
    false
  );

  const { checklist, coverageOutcomes } = deriveChecklistFromRuntimeArtifacts(runtimeArtifacts);
  assert.equal(coverageOutcomes.targeted_advertising_signals?.status, "review_signal");
  assert.equal(coverageOutcomes.do_not_sell_share_availability?.status, "review_signal");
  assert.match(
    coverageOutcomes.do_not_sell_share_availability?.criticalEvidence.statusBasis ?? "",
    /Personalized advertising policy context was retained/
  );
  assert.deepEqual(
    coverageOutcomes.do_not_sell_share_availability?.criticalEvidence.retainedEvidence.advertisingSharingVendors ?? [],
    []
  );
  assert.deepEqual(
    coverageOutcomes.do_not_sell_share_availability?.criticalEvidence.retainedEvidence.advertisingSharingVendorLabelsRetained ?? [],
    ["Meta Pixel"]
  );
  assert.deepEqual(
    coverageOutcomes.do_not_sell_share_availability?.criticalEvidence.retainedEvidence.unmatchedAdvertisingSharingVendorLabels ?? [],
    ["Meta Pixel"]
  );
  assert.equal(
    coverageOutcomes.do_not_sell_share_availability?.criticalEvidence.retainedEvidence.policyPersonalizedAdsLanguageObserved,
    true
  );
  assert.match(
    String(coverageOutcomes.do_not_sell_share_availability?.criticalEvidence.retainedEvidence.policyPersonalizedAdsSnippet ?? ""),
    /Personalized Ads may appear in Apple apps/
  );
  assert.deepEqual(
    coverageOutcomes.do_not_sell_share_availability?.criticalEvidence.retainedEvidence.saleShareRequestUrls ?? [],
    []
  );

  const optOutRow = getChecklistRow(checklist, "do_not_sell_share_availability");
  assert.equal(optOutRow.status, "review_signal");
  assert.match(optOutRow.note, /Personalized advertising policy context was retained/);
});

test("California sale/share vendor mismatch without policy context is checked not observed", () => {
  const runtimeArtifacts = {
    californiaPrivacyEvidence: {
      advertisingSharingVendors: ["Meta Pixel"],
      directAdvertisingSharingVendors: ["Meta Pixel"],
      doNotSellSharePathObserved: false,
      evidenceRefs: ["Meta Pixel vendor label", "Apple translation asset request"],
      policySaleShareAdmissionConfidence: "high",
      policySaleShareAdmissionObserved: false,
      privacyNoticeObserved: true,
      privacyNoticeUrls: ["https://www.apple.com/legal/privacy/"],
      saleShareRequestUrls: [
        "https://tv.apple.com/assets/translation/en-US.json",
        "https://tv.apple.com/assets/musickit/musickit.js"
      ],
      targetedAdvertisingSignalsObserved: true
    },
    cpraCbaOptOutEvidence: {
      advertisingSharingVendors: ["Meta Pixel"],
      choiceControlsInspected: true,
      optOutControlFound: false,
      optOutUiResult: "absent",
      privacyChoiceSearchUrls: ["https://tv.apple.com/"]
    }
  };

  const concerns = buildNormalizedConcerns({
    reviewFindingCandidates: [],
    runtimeArtifacts,
    validationFindings: []
  });
  assert.equal(
    concerns.some((concern) => concern.suggestedUnifiedFindingId === "sale_sharing_controls_missing"),
    false
  );

  const unifiedFindings = buildUnifiedFindingPackets({
    reviewFindingCandidates: [],
    runtimeArtifacts,
    validationFindings: []
  });
  assert.equal(
    unifiedFindings.some((packet) => packet.unifiedFindingId === "sale_sharing_controls_missing"),
    false
  );

  const { checklist, coverageOutcomes } = deriveChecklistFromRuntimeArtifacts(runtimeArtifacts);
  const basis = coverageOutcomes.do_not_sell_share_availability?.criticalEvidence.statusBasis ?? "";

  assert.equal(coverageOutcomes.do_not_sell_share_availability?.status, "not_observed");
  assert.match(
    basis,
    /A possible advertising-sharing vendor label was retained, but CertScore did not verify qualifying third-party sale\/share runtime evidence or a CPRA opt-out path in the tested web context\./
  );
  assert.doesNotMatch(basis, /Personalized advertising policy context/);
  assert.equal(
    coverageOutcomes.do_not_sell_share_availability?.criticalEvidence.retainedEvidence.policyPersonalizedAdsLanguageObserved,
    false
  );
  assert.equal(
    coverageOutcomes.do_not_sell_share_availability?.criticalEvidence.retainedEvidence.policySaleShareAdmissionObserved,
    false
  );
  assert.equal(
    coverageOutcomes.do_not_sell_share_availability?.criticalEvidence.retainedEvidence.policyPersonalizedAdsSnippet ?? null,
    null
  );
  assert.deepEqual(
    coverageOutcomes.do_not_sell_share_availability?.criticalEvidence.retainedEvidence.advertisingSharingVendors ?? [],
    []
  );
  assert.deepEqual(
    coverageOutcomes.do_not_sell_share_availability?.criticalEvidence.retainedEvidence.advertisingSharingVendorLabelsRetained ?? [],
    ["Meta Pixel"]
  );
  assert.deepEqual(
    coverageOutcomes.do_not_sell_share_availability?.criticalEvidence.retainedEvidence.unmatchedAdvertisingSharingVendorLabels ?? [],
    ["Meta Pixel"]
  );
  assert.equal(
    coverageOutcomes.do_not_sell_share_availability?.criticalEvidence.retainedEvidence.runtimeVendorRequestUrlCoherence,
    "mismatch"
  );
  assert.deepEqual(
    coverageOutcomes.do_not_sell_share_availability?.criticalEvidence.retainedEvidence.saleShareRequestUrls ?? [],
    []
  );

  const optOutRow = getChecklistRow(checklist, "do_not_sell_share_availability");
  assert.equal(optOutRow.status, "not_observed");
  assert.equal(optOutRow.assessmentStatus, "checked");
  assert.equal(optOutRow.evidenceState, "not_observed");
  assert.doesNotMatch(optOutRow.note, /Personalized advertising policy context/);
  assert.match(optOutRow.note, /possible advertising-sharing vendor label/i);
});

test("CIPA interaction recording requires session replay vendor/request URL coherence for third-party receipt", () => {
  const runtimeArtifacts = {
    californiaPrivacyEvidence: {
      cipaInteractionRecordingEvidence: {
        cipaConsentTiming: "pre_consent",
        cipaDisclosureObserved: false,
        cipaEvidenceConfidence: "high",
        cipaSensitive: true,
        cipaSignalTypes: ["session_replay"],
        cipaThirdPartyReceiptObserved: true,
        collectionEndpointObserved: true,
        directEvidenceObserved: true,
        pageUrls: ["https://tv.apple.com/"],
        requestUrls: ["https://tv.apple.com/assets/fullstory-bridge.js"],
        vendors: ["FullStory"]
      },
      cipaRuntimeCoverageEvidence: {
        requestPurposeClassificationRowCount: 1,
        sufficientForNegativeCipaReview: true
      },
      privacyNoticeObserved: true,
      verifiedPrivacyNoticeUrls: ["https://www.apple.com/legal/privacy/"]
    }
  };

  const { checklist, coverageOutcomes } = deriveChecklistFromRuntimeArtifacts(runtimeArtifacts);
  const row = getChecklistRow(checklist, "cipa_sensitive_interaction_recording");

  assert.equal(coverageOutcomes.cipa_sensitive_interaction_recording?.status, "not_observed");
  assert.equal(row.status, "not_observed");
  assert.equal(row.assessmentStatus, "checked");
  assert.equal(row.evidenceState, "not_observed");
  assert.match(row.note, /not verified/i);
  assert.equal(
    coverageOutcomes.cipa_sensitive_interaction_recording?.criticalEvidence.retainedEvidence.thirdPartyReceiptObserved,
    false
  );
  assert.equal(
    coverageOutcomes.cipa_sensitive_interaction_recording?.criticalEvidence.retainedEvidence.rawCipaThirdPartyReceiptObserved,
    true
  );
  assert.equal(
    (coverageOutcomes.cipa_sensitive_interaction_recording?.criticalEvidence.retainedEvidence.evidenceCoherence as Record<string, unknown> | undefined)
      ?.vendorRequestUrlCoherence &&
      ((coverageOutcomes.cipa_sensitive_interaction_recording?.criticalEvidence.retainedEvidence.evidenceCoherence as Record<string, unknown>)
        .vendorRequestUrlCoherence as Record<string, unknown>).status,
    "fail"
  );
});

test("blocked page owner text does not create an observed consumer rights method", () => {
  const runtimeArtifacts = {
    californiaPrivacyEvidence: {
      consumerRightsRequestMethodObserved: true,
      consumerRightsRequestMethodSnippets: [
        "Access denied. Please email the site owner if you believe this is a mistake."
      ],
      consumerRightsRequestMethodTypes: ["email site owner"],
      consumerRightsRequestMethodUrls: ["https://example.com/cdn-cgi/challenge-platform/h/b/captcha"],
      privacyNoticeObserved: true,
      verifiedPrivacyNoticeUrls: ["https://example.com/privacy"]
    }
  };

  const concerns = buildNormalizedConcerns({
    reviewFindingCandidates: [],
    runtimeArtifacts,
    validationFindings: []
  });
  assert.equal(
    concerns.some((concern) => concern.suggestedUnifiedFindingId === "privacy_rights_path_present"),
    false
  );

  const { checklist, coverageOutcomes } = deriveChecklistFromRuntimeArtifacts(runtimeArtifacts);
  const row = getChecklistRow(checklist, "consumer_rights_request_methods");

  assert.equal(coverageOutcomes.consumer_rights_request_methods?.status, "review_signal");
  assert.equal(row.status, "review_signal");
  assert.match(row.note, /not coherent enough/i);
});

test("post-opt-out tracking is not testable without confirmed saved opt-out action", () => {
  const runtimeArtifacts = {
    californiaPrivacyEvidence: {
      cpraSaleShareOptOutPathObserved: true,
      optOutInteractionConfirmed: false,
      optOutSavedOrApplied: false,
      postOptOutDirectAdvertisingPersisted: true,
      postOptOutDirectAdvertisingRequestUrls: ["https://connect.facebook.net/en_US/fbevents.js"],
      postOptOutPersistedDirectAdvertisingVendors: ["Meta Pixel"],
      postOptOutTrackingPersisted: true,
      targetedAdvertisingSignalsObserved: true
    }
  };

  const concerns = buildNormalizedConcerns({
    reviewFindingCandidates: [],
    runtimeArtifacts,
    validationFindings: []
  });
  assert.equal(
    concerns.some((concern) => concern.suggestedUnifiedFindingId === "reject_did_not_reduce_tracking"),
    false
  );

  const { checklist, coverageOutcomes } = deriveChecklistFromRuntimeArtifacts(runtimeArtifacts);
  const row = getChecklistRow(checklist, "post_opt_out_tracking_behavior");

  assert.equal(coverageOutcomes.post_opt_out_tracking_behavior?.status, "not_testable");
  assert.equal(row.status, "not_testable");
  assert.match(row.note, /No confirmed opt-out or reject action/i);
});

test("CIPA communication negative row is review signal when origin/runtime coverage is incomplete but meaningful", () => {
  const runtimeArtifacts = {
    californiaPrivacyEvidence: {
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
      cipaRuntimeCoverageEvidence: {
        attempted: true,
        limitation: "origin_not_confirmed",
        requestPurposeClassificationRowCount: 50,
        sufficientForNegativeCipaReview: false
      }
    }
  };

  const { checklist, coverageOutcomes } = deriveChecklistFromRuntimeArtifacts(runtimeArtifacts);
  const row = getChecklistRow(checklist, "cipa_sensitive_communication_interception");

  assert.equal(coverageOutcomes.cipa_sensitive_communication_interception?.status, "review_signal");
  assert.equal(
    coverageOutcomes.cipa_sensitive_communication_interception?.criticalEvidence.statusBasis,
    "No direct chat or pre-submit interception evidence was retained, but runtime coverage was limited; treat this as an incomplete negative review."
  );
  assert.equal(
    coverageOutcomes.cipa_sensitive_communication_interception?.limitation,
    "No direct chat or pre-submit interception evidence was retained, but runtime coverage was limited; treat this as an incomplete negative review."
  );
  assert.doesNotMatch(
    JSON.stringify(coverageOutcomes.cipa_sensitive_communication_interception?.criticalEvidence ?? {}),
    /No chat widget|third-party pre-submit text receipt|communication interception endpoint/
  );
  assert.equal(
    coverageOutcomes.cipa_sensitive_communication_interception?.criticalEvidence.missingOrIncompleteSourceSignals.some(
      (gap) => gap.field === "californiaPrivacyEvidence.cipaRuntimeCoverageEvidence.requestPurposeClassificationRowCount"
    ),
    false
  );
  assert.equal(
    coverageOutcomes.cipa_sensitive_communication_interception?.criticalEvidence.missingOrIncompleteSourceSignals.some(
      (gap) => gap.field === "californiaPrivacyEvidence.cipaRuntimeCoverageEvidence.sufficientForNegativeCipaReview"
    ),
    true
  );
  assert.equal(
    coverageOutcomes.cipa_sensitive_communication_interception?.criticalEvidence.missingOrIncompleteSourceSignals.some(
      (gap) => gap.field === "californiaPrivacyEvidence.cipaRuntimeCoverageEvidence.limitation"
    ),
    true
  );
  assert.equal(row.status, "review_signal");
  assert.equal(row.assessmentStatus, "review_signal");
  assert.equal(row.statusLabel, "Review signal");
  assert.equal(row.evidenceState, "observed");
});

test("sale-share disclosure alignment does not retain internal gap state after vendor URL mismatch", () => {
  const runtimeArtifacts = {
    californiaPrivacyEvidence: {
      advertisingSharingVendors: ["Meta Pixel"],
      directAdvertisingSharingVendors: ["Meta Pixel"],
      doNotSellSharePathObserved: false,
      policyRuntimeDisclosureAlignment: "gap_observed",
      policyRuntimeDisclosureAlignmentBasis: "potential_gap_no_category_disclosure",
      policyRuntimeDisclosureSnippets: ["We disclose advertising partners in our privacy notice."],
      saleShareRequestUrls: [
        "https://tv.apple.com/assets/translation/en-US.json",
        "https://tv.apple.com/assets/musickit/musickit.js"
      ],
      targetedAdvertisingSignalsObserved: true,
      unmatchedRuntimeDisclosureVendors: ["Meta Pixel"]
    }
  };

  const { checklist, coverageOutcomes } = deriveChecklistFromRuntimeArtifacts(runtimeArtifacts);
  const row = getChecklistRow(checklist, "sale_share_disclosure_alignment");
  const retainedEvidence = coverageOutcomes.sale_share_disclosure_alignment?.criticalEvidence.retainedEvidence;

  assert.equal(coverageOutcomes.sale_share_disclosure_alignment?.status, "not_observed");
  assert.equal(row.status, "not_observed");
  assert.equal(row.assessmentStatus, "checked");
  assert.equal(row.evidenceState, "not_observed");
  assert.equal(retainedEvidence?.disclosureAlignment, "review_signal");
  assert.equal(retainedEvidence?.disclosureAlignmentBasis, "vendor_request_url_mismatch");
  assert.equal(retainedEvidence?.rawDisclosureAlignment, "gap_observed");
  assert.equal(retainedEvidence?.runtimeVendorRequestUrlCoherence, "mismatch");
});
