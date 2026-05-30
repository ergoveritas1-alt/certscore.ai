import assert from "node:assert/strict";
import test from "node:test";
import { buildMergedSignalRecords, buildReviewFindingCandidatesFromMergedSignals } from "../../lib/scans/merged-signals";
import {
  buildNormalizedConcerns,
  buildUnifiedFindingCandidatesFromConcerns
} from "../../lib/scans/normalized-concerns";
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
