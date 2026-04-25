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

test("insufficient major document-semantic signals create bounded unresolved candidates", () => {
  const mergedSignals = buildMergedSignalRecords({
    nanoSignals: [
      {
        confidence: 0.4,
        evidenceRefs: ["https://example.com/privacy"],
        key: "privacy.gpc_disclosure_present",
        label: "GPC disclosure present",
        populationStatus: "insufficient",
        reportSignalSource: "document_semantic_signal",
        source: "nano",
        value: true,
        valueType: "boolean"
      }
    ]
  });

  const [candidate] = buildReviewFindingCandidatesFromMergedSignals({
    mergedSignals
  });

  assert.equal(candidate?.signalKey, "disclosure.key_page_discovery_unresolved_after_bounded_search");
  assert.equal(candidate?.signalSource, "snapshot_signal");
  assert.equal(candidate?.title, "GPC handling disclosed unverified");
  assert.equal(candidate?.fallbackEvidence?.inferredTargetFindingId, "gpc_disclosure_present");
  assert.equal(candidate?.fallbackEvidence?.mergedSignalPopulationStatus, "insufficient");
});

test("privacy contact merged-signal candidates retain sibling contact channel evidence", () => {
  const mergedSignals = buildMergedSignalRecords({
    nanoSignals: [
      {
        confidence: 0.88,
        evidenceRefs: ["https://example.com/privacy"],
        key: "privacy.privacy_contact_path_present",
        label: "Privacy contact path present",
        reportSignalSource: "policy_enrichment_signal",
        source: "nano",
        value: true,
        valueType: "boolean"
      },
      {
        confidence: 0.9,
        evidenceRefs: ["https://example.com/privacy"],
        key: "privacyContactChannelType",
        label: "Privacy contact channel type",
        reportSignalSource: "policy_enrichment_signal",
        source: "nano",
        value: "email",
        valueType: "text"
      }
    ]
  });

  const candidate = buildReviewFindingCandidatesFromMergedSignals({
    mergedSignals
  }).find((row) => row.signalKey === "privacy.privacy_contact_path_present");

  assert.equal(candidate?.fallbackEvidence?.privacyContactChannelType, "email");
});
