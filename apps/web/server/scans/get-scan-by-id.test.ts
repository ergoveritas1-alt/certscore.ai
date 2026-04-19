import assert from "node:assert/strict";
import test from "node:test";

import {
  deriveSupplementalSnapshotSignals,
  type ScanDetailSupplementalEventRecord as ScanEventRecord,
  type ScanDetailSupplementalSignalRecord as ScanSignalRecord
} from "../../lib/scans/scan-detail-supplemental-signals";

function makeFamilyPacketEvent(findingIds: string[]): ScanEventRecord {
  return {
    createdAt: "2026-03-30T00:00:00.000Z",
    eventType: "runtime.build_phase_diagnostic",
    id: "evt_family_packet",
    message: "family packet",
    metadataJson: {
      packets: [
        {
          familyId: "support_access",
          supportedUnifiedFindings: findingIds.map((findingId) => ({ findingId }))
        }
      ],
      phase: "finding_family_packets"
    }
  };
}

test("suppresses accessibility support missing when family packet already verified the support path", () => {
  const signals = deriveSupplementalSnapshotSignals({
    existingSignals: [],
    events: [makeFamilyPacketEvent(["accessibility_support_path_present"])],
    primaryPolicyEnrichment: null,
    snapshot: {
      accessibility_contact_method_present: false
    }
  });

  assert.equal(signals.some((signal) => signal.key === "accessibility.accessibility_support_path_missing"), false);
});

test("suppresses accessibility support missing when a positive accessibility signal already exists", () => {
  const signals = deriveSupplementalSnapshotSignals({
    existingSignals: [
      {
        key: "accessibility.accessibility_contact_method_present"
      }
    ] satisfies ScanSignalRecord[],
    events: [],
    primaryPolicyEnrichment: null,
    snapshot: {
      accessibility_contact_method_present: false
    }
  });

  assert.equal(signals.some((signal) => signal.key === "accessibility.accessibility_support_path_missing"), false);
});

test("suppresses weak privacy contact missing when policy extraction confidence is low", () => {
  const signals = deriveSupplementalSnapshotSignals({
    existingSignals: [] satisfies ScanSignalRecord[],
    events: [],
    primaryPolicyEnrichment: {
      policy_dsar_confidence: 0.45,
      policy_notice_contact_present: null,
      policy_semantic_confidence: 0.54,
      policy_snippet_count: 2
    },
    snapshot: {
      privacy_contact_channel_type: "none"
    }
  });

  assert.equal(signals.some((signal) => signal.key === "privacy.privacy_contact_channel_missing"), false);
});

test("keeps privacy contact missing when the negative is backed by stronger extraction quality", () => {
  const signals = deriveSupplementalSnapshotSignals({
    existingSignals: [] satisfies ScanSignalRecord[],
    events: [],
    primaryPolicyEnrichment: {
      policy_dsar_confidence: 0.92,
      policy_notice_contact_present: null,
      policy_semantic_confidence: 0.93,
      policy_snippet_count: 7
    },
    snapshot: {
      privacy_contact_channel_type: "none"
    }
  });

  assert.equal(signals.some((signal) => signal.key === "privacy.privacy_contact_channel_missing"), true);
});

test("suppresses privacy contact missing when a positive privacy-contact signal already exists", () => {
  const signals = deriveSupplementalSnapshotSignals({
    existingSignals: [
      {
        key: "privacy.privacy_contact_path_present"
      }
    ] satisfies ScanSignalRecord[],
    events: [],
    primaryPolicyEnrichment: {
      policy_dsar_confidence: 0.92,
      policy_notice_contact_present: null,
      policy_semantic_confidence: 0.93,
      policy_snippet_count: 7
    },
    snapshot: {
      privacy_contact_channel_type: "none"
    }
  });

  assert.equal(signals.some((signal) => signal.key === "privacy.privacy_contact_channel_missing"), false);
});
