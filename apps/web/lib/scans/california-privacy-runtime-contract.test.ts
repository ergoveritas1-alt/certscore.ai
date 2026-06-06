import assert from "node:assert/strict";
import test from "node:test";

import {
  CALIFORNIA_PRIVACY_RUNTIME_ARTIFACT_FIXTURES,
  CALIFORNIA_PRIVACY_RUNTIME_ARTIFACT_REQUIRED_KEYS
} from "../../../../packages/shared/src/regulatory-review/california-privacy-runtime-fixtures";
import { deriveCaliforniaPrivacyCoverageChecklist } from "./california-privacy-coverage-checklist";
import { deriveCaliforniaPrivacyCoveragePolicyOutcomes } from "./california-privacy-coverage-policy";
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
