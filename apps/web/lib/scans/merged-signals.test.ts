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
    linkedValidationEvidenceBySignalKey: new Map([
      [
        "privacy.cookie_runtime_disclosure_gap_detected",
        {
          disclosureMismatchExplained: true,
          disclosureSearchScopeRetained: true,
          mismatchExplanation: "Runtime cookie _fbp was not found in the retained cookie disclosure.",
          negativeDisclosureSearchPerformed: true,
          observedBehavior: "Runtime set _fbp.",
          policyExtractionStatus: "fetched",
          policySnippet: "Cookie policy text.",
          policySourceUrl: "https://example.com/cookie-policy"
        }
      ]
    ]),
    mergedSignals
  }).find((row) => row.signalKey === "privacy.cookie_runtime_disclosure_gap_detected");

  assert.deepEqual(candidate?.fallbackEvidence?.runtimeCookieNames, ["_ga", "_fbp"]);
  assert.deepEqual(candidate?.fallbackEvidence?.unmatchedCookieNames, ["_fbp"]);
  assert.equal(candidate?.fallbackEvidence?.unmatchedThirdPartyCookieCount, 1);
});

test("session replay merged-signal candidates retain vendor runtime evidence", () => {
  const mergedSignals = buildMergedSignalRecords({
    scannerSignals: [
      {
        confidence: 0.9,
        evidenceRefs: ["scan_tracker_vendors"],
        key: "privacy.session_replay_runtime_detected",
        label: "Session replay runtime detected",
        reportSignalSource: "snapshot_signal",
        source: "scanner",
        value: true,
        valueType: "boolean"
      },
      {
        confidence: 0.9,
        key: "privacy.session_replay_runtime_vendors",
        label: "Session replay runtime vendors",
        reportSignalSource: "snapshot_signal",
        source: "scanner",
        value: ["Microsoft Clarity"],
        valueType: "string_array"
      }
    ]
  });

  const candidate = buildReviewFindingCandidatesFromMergedSignals({
    mergedSignals
  }).find((row) => row.signalKey === "privacy.session_replay_runtime_detected");

  assert.deepEqual(candidate?.fallbackEvidence?.runtimeVendors, ["Microsoft Clarity"]);
  assert.deepEqual(candidate?.fallbackEvidence?.session_replay_runtime_vendors, ["Microsoft Clarity"]);
  assert.ok(Array.isArray(candidate?.fallbackEvidence?.session_replay_runtime_artifacts));
});

test("fingerprinting merged-signal candidates retain tier and attribute evidence", () => {
  const mergedSignals = buildMergedSignalRecords({
    scannerSignals: [
      {
        confidence: 0.88,
        evidenceRefs: [
          "scan_runtime_artifacts.hybrid_runtime_evidence.fingerprintSummary",
          "https://fpjs.example.test/collect"
        ],
        key: "privacy.fingerprinting_detected",
        label: "Fingerprinting runtime detected",
        reportSignalSource: "snapshot_signal",
        source: "scanner",
        value: true,
        valueType: "boolean"
      },
      {
        confidence: 0.88,
        key: "privacy.fingerprinting_tier",
        label: "Fingerprinting runtime tier",
        reportSignalSource: "snapshot_signal",
        source: "scanner",
        value: 3,
        valueType: "number"
      },
      {
        confidence: 0.88,
        key: "privacy.fingerprinting_attribute_categories",
        label: "Fingerprinting attribute categories",
        reportSignalSource: "snapshot_signal",
        source: "scanner",
        value: ["canvas_webgl", "audio"],
        valueType: "string_array"
      },
      {
        confidence: 0.88,
        key: "privacy.fingerprinting_runtime_vendors",
        label: "Fingerprinting runtime vendors",
        reportSignalSource: "snapshot_signal",
        source: "scanner",
        value: ["FingerprintJS"],
        valueType: "string_array"
      }
    ]
  });

  const candidate = buildReviewFindingCandidatesFromMergedSignals({
    mergedSignals
  }).find((row) => row.signalKey === "privacy.fingerprinting_detected");

  assert.equal(candidate?.fallbackEvidence?.fingerprintTier, 3);
  assert.deepEqual(candidate?.fallbackEvidence?.fingerprintAttributeCategories, ["canvas_webgl", "audio"]);
  assert.deepEqual(candidate?.fallbackEvidence?.runtimeVendors, ["FingerprintJS"]);
  assert.equal(candidate?.fallbackEvidence?.fingerprintRuntimeEvidenceRetained, true);
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

test("AI surface tracking runtime signal creates a signal-backed finding candidate", () => {
  const mergedSignals = buildMergedSignalRecords({
    scannerSignals: [
      {
        confidence: 0.74,
        evidenceRefs: [
          "https://example.com/ai-assistant",
          "https://www.google-analytics.com/g/collect?v=2"
        ],
        key: "ai.flow_tracking_review_signal",
        label: "AI surface tracking review signal",
        provenance: [
          {
            detail: "hybrid_runtime_evidence.ai_surface_runtime_evidence",
            kind: "document"
          }
        ],
        reportSignalSource: "runtime_artifact_signal",
        source: "scanner",
        value: true,
        valueType: "boolean"
      }
    ]
  });

  const candidate = buildReviewFindingCandidatesFromMergedSignals({
    mergedSignals
  }).find((row) => row.signalKey === "ai.flow_tracking_review_signal");

  assert.equal(candidate?.signalKey, "ai.flow_tracking_review_signal");
  assert.equal(candidate?.signalSource, "runtime_artifact_signal");
});
