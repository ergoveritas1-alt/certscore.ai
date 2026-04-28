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
      },
      {
        confidence: 0.9,
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

test("cookie disclosure gap merged-signal candidates retain runtime comparison evidence", () => {
  const mergedSignals = buildMergedSignalRecords({
    nanoSignals: [
      {
        confidence: 0.86,
        evidenceRefs: ["https://example.com/cookie-policy"],
        key: "privacy.cookie_runtime_disclosure_gap_detected",
        label: "Cookie runtime disclosure gap detected",
        reportSignalSource: "document_semantic_signal",
        source: "nano",
        value: true,
        valueType: "boolean"
      },
      {
        confidence: 0.86,
        key: "cookieRuntimeNames",
        label: "Runtime cookie names",
        reportSignalSource: "document_semantic_signal",
        source: "nano",
        value: ["_ga", "_fbp"],
        valueType: "string_array"
      },
      {
        confidence: 0.86,
        key: "cookieUnmatchedNames",
        label: "Unmatched runtime cookie names",
        reportSignalSource: "document_semantic_signal",
        source: "nano",
        value: ["_fbp"],
        valueType: "string_array"
      },
      {
        confidence: 0.86,
        key: "cookieUnmatchedThirdPartyCount",
        label: "Unmatched third-party cookie count",
        reportSignalSource: "document_semantic_signal",
        source: "nano",
        value: 1,
        valueType: "number"
      }
    ]
  });

  const candidate = buildReviewFindingCandidatesFromMergedSignals({
    mergedSignals
  }).find((row) => row.signalKey === "privacy.cookie_runtime_disclosure_gap_detected");

  assert.deepEqual(candidate?.fallbackEvidence?.runtimeCookieNames, ["_ga", "_fbp"]);
  assert.deepEqual(candidate?.fallbackEvidence?.unmatchedCookieNames, ["_fbp"]);
  assert.equal(candidate?.fallbackEvidence?.unmatchedThirdPartyCookieCount, 1);
});

test("merged signal candidates include domainIndustryPrimary from macroEnrichment", () => {
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

  const candidates = buildReviewFindingCandidatesFromMergedSignals({
    macroEnrichment: {
      normalized_output_json: {
        industry_primary: "media"
      }
    },
    mergedSignals
  });

  assert.equal(candidates.length, 1);
  assert.equal(candidates[0]?.fallbackEvidence?.domainIndustryPrimary, "media");
});

test("financial merged signal candidates on non-finance domain are suppressed via macroEnrichment", () => {
  const mergedSignals = buildMergedSignalRecords({
    scannerSignals: [
      {
        confidence: 0.8,
        evidenceRefs: ["https://cookingchanneltv.com/cookies"],
        key: "financial.perpetuals_or_derivatives_language_present",
        label: "Perpetuals or derivatives language present",
        reportSignalSource: "snapshot_signal",
        source: "scanner",
        value: true,
        valueType: "boolean"
      }
    ]
  });

  const candidates = buildReviewFindingCandidatesFromMergedSignals({
    macroEnrichment: {
      normalized_output_json: {
        industry_primary: "media"
      }
    },
    mergedSignals
  });

  assert.equal(candidates.length, 0);
});
