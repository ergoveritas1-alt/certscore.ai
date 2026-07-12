import assert from "node:assert/strict";
import test from "node:test";
import { buildMergedSignalRecords, buildReviewFindingCandidatesFromMergedSignals } from "../../lib/scans/merged-signals";
import {
  buildNormalizedConcerns,
  buildUnifiedFindingCandidatesFromConcerns
} from "../../lib/scans/normalized-concerns";
import {
  deriveBrowserScanCanonicalMaterializationFromObservedSignals,
  deriveBrowserScanCanonicalMaterializationFromStoredSignalRows
} from "./canonical-materialization";
import { summarizeBrowserEvidence, type BrowserScanEventRow } from "./evidence-summary";

test("raw BX01 browser evidence alone does not create concern-backed finding candidates", () => {
  const events: BrowserScanEventRow[] = [
    {
      event_type: "network_request",
      observed_at_ms: 120,
      event_json: {
        eventType: "network_request",
        hostname: "www.googletagmanager.com",
        observedAtMs: 120,
        resourceType: "script",
        url: "https://www.googletagmanager.com/gtm.js?id=GTM-TEST"
      }
    }
  ];

  const summary = summarizeBrowserEvidence({
    artifacts: [],
    events,
    targetHostname: "example.com"
  });
  const mergedSignals = buildMergedSignalRecords({});
  const reviewCandidates = buildReviewFindingCandidatesFromMergedSignals({
    mergedSignals
  });
  const concerns = buildNormalizedConcerns({
    reviewFindingCandidates: reviewCandidates,
    validationFindings: []
  });

  assert.equal(summary.thirdPartyRequestCount, 1);
  assert.equal(reviewCandidates.length, 0);
  assert.equal(concerns.length, 0);
  assert.equal(buildUnifiedFindingCandidatesFromConcerns(concerns).length, 0);
});

test("WS01-normalized BX01 signals enter the canonical concern pipeline", () => {
  const mergedSignals = buildMergedSignalRecords({
    browserExtensionSignals: [
      {
        confidence: 0.8,
        evidenceRefs: ["bx01.consent_ui:500:div#cookie-banner"],
        key: "privacy.cookie_banner_present",
        label: "Cookie banner present",
        observedAt: "2026-05-30T12:00:00.500Z",
        populationStatus: "present",
        provenance: [
          {
            detail: "ws01_bx01_observed_signal",
            kind: "runtime"
          }
        ],
        reportSignalSource: "snapshot_signal",
        source: "browser_extension_bx01",
        value: true,
        valueType: "boolean"
      },
      {
        confidence: 0.8,
        evidenceRefs: ["bx01.consent_ui:500:reject_control"],
        key: "privacy.reject_all_present",
        label: "Reject-all control present",
        observedAt: "2026-05-30T12:00:00.500Z",
        populationStatus: "present",
        provenance: [
          {
            detail: "ws01_bx01_observed_signal",
            kind: "runtime"
          }
        ],
        reportSignalSource: "snapshot_signal",
        source: "browser_extension_bx01",
        value: true,
        valueType: "boolean"
      },
      {
        confidence: 0.82,
        evidenceRefs: [
          "https://www.googletagmanager.com/gtm.js?id=GTM-TEST",
          "bx01.network_request:120:https://www.googletagmanager.com/gtm.js?id=GTM-TEST"
        ],
        key: "privacy.preconsent_tracking_detected",
        label: "Pre-consent tracking detected",
        observedAt: "2026-05-30T12:00:00.120Z",
        populationStatus: "present",
        provenance: [
          {
            detail: "ws01_bx01_observed_signal",
            kind: "runtime"
          }
        ],
        reportSignalSource: "snapshot_signal",
        source: "browser_extension_bx01",
        value: true,
        valueType: "boolean"
      },
      {
        confidence: 0.82,
        evidenceRefs: ["https://www.googletagmanager.com/gtm.js?id=GTM-TEST"],
        key: "privacy.preconsent_tracker_vendors",
        label: "Pre-consent tracker vendors",
        observedAt: "2026-05-30T12:00:00.120Z",
        populationStatus: "present",
        provenance: [
          {
            detail: "ws01_bx01_observed_signal",
            kind: "runtime"
          }
        ],
        reportSignalSource: "snapshot_signal",
        source: "browser_extension_bx01",
        value: ["Google Tag Manager"],
        valueType: "string_array"
      },
      {
        confidence: 0.82,
        evidenceRefs: ["https://www.googletagmanager.com/gtm.js?id=GTM-TEST"],
        key: "privacy.preconsent_tracker_categories",
        label: "Pre-consent tracker categories",
        observedAt: "2026-05-30T12:00:00.120Z",
        populationStatus: "present",
        provenance: [
          {
            detail: "ws01_bx01_observed_signal",
            kind: "runtime"
          }
        ],
        reportSignalSource: "snapshot_signal",
        source: "browser_extension_bx01",
        value: ["tag_manager"],
        valueType: "string_array"
      }
    ]
  });
  const reviewCandidates = buildReviewFindingCandidatesFromMergedSignals({
    mergedSignals
  });
  const concerns = buildNormalizedConcerns({
    reviewFindingCandidates: reviewCandidates,
    validationFindings: []
  });
  const unifiedCandidates = buildUnifiedFindingCandidatesFromConcerns(concerns);

  assert.ok(reviewCandidates.some((candidate) => candidate.signalKey === "privacy.preconsent_tracking_detected"));
  assert.ok(concerns.some((concern) => concern.signalKey === "privacy.preconsent_tracking_detected"));
  assert.ok(unifiedCandidates.some((candidate) => candidate.signalKey === "privacy.preconsent_tracking_detected"));
  assert.ok(
    unifiedCandidates.some((candidate) =>
      Array.isArray(candidate.fallbackEvidence?.preconsent_tracker_evidence_urls) &&
      candidate.fallbackEvidence.preconsent_tracker_evidence_urls.includes("https://www.googletagmanager.com/gtm.js?id=GTM-TEST")
    )
  );
});

test("WS01-normalized BX01 signals materialize canonical dashboard fields", () => {
  const materialized = deriveBrowserScanCanonicalMaterializationFromObservedSignals([
    {
      category: "privacy",
      confidence: 0.72,
      evidenceRefs: ["https://cdn.example.net/app.js"],
      key: "privacy.third_party_request_count",
      label: "Third-party request count",
      observedAtMs: 120,
      populationSource: "browser_extension_bx01",
      provenance: { sourceId: "BX01", sourceType: "browser_extension" },
      value: 4,
      valueType: "number"
    },
    {
      category: "privacy",
      confidence: 0.72,
      evidenceRefs: ["https://cdn.example.net/app.js"],
      key: "privacy.third_party_request_domains",
      label: "Third-party request domains",
      observedAtMs: 120,
      populationSource: "browser_extension_bx01",
      provenance: { sourceId: "BX01", sourceType: "browser_extension" },
      value: ["cdn.example.net", "metrics.example.net"],
      valueType: "string_array"
    },
    {
      category: "privacy",
      confidence: 0.78,
      evidenceRefs: ["https://www.googletagmanager.com/gtm.js?id=GTM-TEST"],
      key: "privacy.tracker_vendors",
      label: "Tracker vendors",
      observedAtMs: 150,
      populationSource: "browser_extension_bx01",
      provenance: { sourceId: "BX01", sourceType: "browser_extension" },
      value: ["Google Tag Manager"],
      valueType: "string_array"
    },
    {
      category: "privacy",
      confidence: 0.78,
      evidenceRefs: ["https://www.googletagmanager.com/gtm.js?id=GTM-TEST"],
      key: "privacy.tracker_vendor_count",
      label: "Tracker vendor count",
      observedAtMs: 150,
      populationSource: "browser_extension_bx01",
      provenance: { sourceId: "BX01", sourceType: "browser_extension" },
      value: 1,
      valueType: "number"
    },
    {
      category: "privacy",
      confidence: 0.82,
      evidenceRefs: ["https://www.googletagmanager.com/gtm.js?id=GTM-TEST"],
      key: "privacy.preconsent_tracker_categories",
      label: "Pre-consent tracker categories",
      observedAtMs: 150,
      populationSource: "browser_extension_bx01",
      provenance: { sourceId: "BX01", sourceType: "browser_extension" },
      value: ["tag_manager"],
      valueType: "string_array"
    },
    {
      category: "privacy",
      confidence: 0.76,
      evidenceRefs: ["bx01.fingerprint_api:60:canvas_webgl:HTMLCanvasElement.toDataURL"],
      key: "privacy.fingerprinting_tier",
      label: "Fingerprinting evidence tier",
      observedAtMs: 60,
      populationSource: "browser_extension_bx01",
      provenance: { sourceId: "BX01", sourceType: "browser_extension" },
      value: 2,
      valueType: "number"
    },
    {
      category: "privacy",
      confidence: 0.76,
      evidenceRefs: ["bx01.fingerprint_api:60:canvas_webgl:HTMLCanvasElement.toDataURL"],
      key: "privacy.fingerprinting_attribute_categories",
      label: "Fingerprinting attribute categories",
      observedAtMs: 60,
      populationSource: "browser_extension_bx01",
      provenance: { sourceId: "BX01", sourceType: "browser_extension" },
      value: ["canvas_webgl", "audio"],
      valueType: "string_array"
    }
  ]);

  assert.equal(materialized.thirdPartyRequestCount, 4);
  assert.deepEqual(materialized.thirdPartyRequestDomains, ["cdn.example.net", "metrics.example.net"]);
  assert.deepEqual(materialized.hybridRuntimeEvidencePatch.vendorSummary.normalizedVendors, ["Google Tag Manager"]);
  assert.deepEqual(materialized.hybridRuntimeEvidencePatch.vendorSummary.rawThirdPartyDomains, ["cdn.example.net", "metrics.example.net"]);
  assert.equal(materialized.hybridRuntimeEvidencePatch.vendorSummary.vendorCategoryCounts.tag_manager, 1);
  assert.equal(materialized.hybridRuntimeEvidencePatch.fingerprintSummary.tier, 2);
  assert.deepEqual(materialized.hybridRuntimeEvidencePatch.fingerprintSummary.attributeCategories, [
    { count: 1, firstSeenMs: null, name: "canvas_webgl" },
    { count: 1, firstSeenMs: null, name: "audio" }
  ]);
  assert.equal(materialized.hybridRuntimeEvidencePatch.fingerprintingEvidenceSummary.coverageRetained, true);
  assert.equal(materialized.hybridRuntimeEvidencePatch.fingerprintingEvidenceSummary.fingerprintingObserved, true);
  assert.ok(materialized.score < 100);
});

test("stored WS01-normalized BX01 signal rows can repair browser-extension dashboard fields", () => {
  const materialized = deriveBrowserScanCanonicalMaterializationFromStoredSignalRows([
    {
      category: "privacy",
      confidence: 0.72,
      evidence_refs: ["https://analytics.example.test/collect"],
      observed_at: "2026-05-30T12:00:00.120Z",
      population_source: "browser_extension_bx01",
      signal_key: "privacy.third_party_request_count",
      signal_label: "Third-party request count",
      signal_value_json: 233,
      value_type: "number"
    },
    {
      category: "privacy",
      confidence: 0.72,
      evidence_refs: ["https://analytics.example.test/collect"],
      observed_at: "2026-05-30T12:00:00.120Z",
      population_source: "browser_extension_bx01",
      signal_key: "privacy.third_party_request_domains",
      signal_label: "Third-party request domains",
      signal_value_json: ["analytics.example.test", "cdn.example.test"],
      value_type: "string_array"
    },
    {
      category: "privacy",
      confidence: 0.72,
      evidence_refs: ["bx01.cookie:150:_ga"],
      observed_at: "2026-05-30T12:00:00.150Z",
      population_source: "browser_extension_bx01",
      signal_key: "privacy.cookie_count_total",
      signal_label: "Cookie count total",
      signal_value_json: 147,
      value_type: "number"
    }
  ]);

  assert.equal(materialized.thirdPartyRequestCount, 233);
  assert.equal(materialized.cookieCountTotal, 147);
  assert.equal(materialized.hybridRuntimeEvidencePatch.networkSummary.thirdPartyRequestCount, 233);
  assert.equal(materialized.hybridRuntimeEvidencePatch.storageSummary.cookiesSeenCount, 147);
  assert.ok(materialized.score < 100);
});
