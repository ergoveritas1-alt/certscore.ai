import assert from "node:assert/strict";
import test from "node:test";

import { buildMergedSignalRecords, buildReviewFindingCandidatesFromMergedSignals } from "./merged-signals";

test("scanner present values win over nano backfill during merge", () => {
  const [merged] = buildMergedSignalRecords({
    nanoSignals: [
      {
        confidence: 0.98,
        key: "privacy.gpc_disclosure_present",
        label: "GPC disclosure present",
        reportSignalSource: "policy_enrichment_signal",
        source: "nano",
        value: false,
        valueType: "boolean"
      }
    ],
    scannerSignals: [
      {
        confidence: 0.8,
        key: "privacy.gpc_disclosure_present",
        label: "GPC disclosure present",
        reportSignalSource: "snapshot_signal",
        source: "scanner",
        value: true,
        valueType: "boolean"
      }
    ]
  });

  assert.ok(merged);
  assert.equal(merged.value, true);
  assert.equal(merged.selectedPopulation?.source, "scanner");
  assert.equal(merged.populationStatus, "conflicting");
});

test("nano can backfill missing signals and create signal-backed finding candidates", () => {
  const mergedSignals = buildMergedSignalRecords({
    nanoSignals: [
      {
        confidence: 0.91,
        evidenceRefs: ["https://example.com/privacy"],
        key: "privacy.gpc_disclosure_present",
        label: "GPC disclosure present",
        reportSignalSource: "policy_enrichment_signal",
        source: "nano",
        value: true,
        valueType: "boolean"
      }
    ]
  });

  const [candidate] = buildReviewFindingCandidatesFromMergedSignals({
    mergedSignals
  });

  assert.equal(candidate?.signalKey, "privacy.gpc_disclosure_present");
  assert.equal(candidate?.signalSource, "policy_enrichment_signal");
  assert.equal(candidate?.sourceType, "signal");
});
