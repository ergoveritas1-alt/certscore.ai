import assert from "node:assert/strict";
import test from "node:test";

import {
  deriveSupplementalSnapshotSignals,
  type ScanDetailSupplementalEventRecord as ScanEventRecord,
  type ScanDetailSupplementalSignalRecord as ScanSignalRecord
} from "../../lib/scans/scan-detail-supplemental-signals";
import {
  buildScanExecutionProvenance,
  type ScanExecutionProvenanceEventRecord
} from "./scan-execution-provenance";

type ExistingSignalRecord = Pick<ScanSignalRecord, "key">;

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
    ] satisfies ExistingSignalRecord[],
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
    ] satisfies ExistingSignalRecord[],
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

test("builds scan provenance from retained Lambda dispatch and result events", () => {
  const events: ScanExecutionProvenanceEventRecord[] = [
    {
      createdAt: "2026-06-19T10:00:00.000Z",
      eventType: "v2_lambda_dispatch.requested",
      id: "evt_requested",
      message: "requested",
      metadataJson: {
        awsRegion: "eu-west-1",
        functionName: "certscore-v2-dag-local-lambda-eu-west-1",
        scannerRuntime: "certscore-v2-dag-parallel-path",
        simulatedLocalLambda: false
      }
    },
    {
      createdAt: "2026-06-19T10:00:01.000Z",
      eventType: "v2_lambda_dispatch.accepted",
      id: "evt_accepted",
      message: "accepted",
      metadataJson: {
        awsRegion: "eu-west-1",
        functionName: "certscore-v2-dag-local-lambda-eu-west-1",
        scannerRuntime: "certscore-v2-dag-parallel-path",
        simulatedLocalLambda: false
      }
    },
    {
      createdAt: "2026-06-19T10:00:08.000Z",
      eventType: "v2_lambda_result.received",
      id: "evt_result",
      message: "result",
      metadataJson: {
        artifactPointers: {
          scanArtifactUri: "s3://ws01-scan-artifacts-199536052647-eu-west-1/v2-dag-lambda/prod/scan-123/scan.json"
        },
        resultStatus: "completed",
        scannerGitSha: "abc123scanner",
        scannerImageTag: "scanner-image:abc123scanner",
        scannerRuntimeVersion: "v2-dag-runtime.1"
      }
    }
  ];

  const provenance = buildScanExecutionProvenance({
    events,
    runtimeArtifacts: {
      local_v2_dag_lambda_runtime_diagnostics: {
        awsLambdaRuntime: true
      }
    },
    scanConfig: {
      execution: {
        v2DagLambda: {
          awsRegion: "eu-west-1",
          functionName: "certscore-v2-dag-local-lambda-eu-west-1"
        }
      }
    },
    scanFromLabel: "EU-IE",
    scanFromValue: "eu_ie"
  });

  assert.equal(provenance.requestedScanFromValue, "eu_ie");
  assert.equal(provenance.lambdaRunViaAws, true);
  assert.equal(provenance.lambdaAwsRegion, "eu-west-1");
  assert.equal(provenance.lambdaResultStatus, "completed");
  assert.equal(provenance.artifactBucket, "ws01-scan-artifacts-199536052647-eu-west-1");
  assert.equal(provenance.artifactPrefix, "v2-dag-lambda/prod/scan-123");
  assert.equal(provenance.browserRuntimeMode, "lambda_chromium");
  assert.equal(provenance.scannerRuntime, "certscore-v2-dag-parallel-path");
  assert.equal(provenance.scannerGitSha, "abc123scanner");
  assert.equal(provenance.scannerImageTag, "scanner-image:abc123scanner");
  assert.equal(provenance.scannerRuntimeVersion, "v2-dag-runtime.1");
});
