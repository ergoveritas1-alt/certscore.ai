import { createHash } from "node:crypto";
import { canonicalEvidenceBundleSchema, type CanonicalEvidenceBundle, type NormalizedVendorObservation } from "../index.js";

/** Shared retained-evidence fixture for scanner -> contract -> WC01 tests. */
export function gpcRuntimeFixture(input: {
  enabled: boolean; vendors?: Array<{ name: string; purpose?: NormalizedVendorObservation["purpose"]; atMs?: number }>;
}): CanonicalEvidenceBundle {
  const url = "https://example.test/", at = "2026-09-05T12:00:00.000Z";
  const lane = input.enabled ? "gpc_observation" : "runtime_evidence";
  const vendors = input.vendors ?? [];
  const request = (id: string, requestUrl: string, timestampMs: number, main: boolean) => ({
    eventId: id, requestId: id, eventType: "network_request", timestampMs,
    requestUrl, url: requestUrl, method: "GET", resourceType: main ? "document" : "fetch", isMainFrame: main,
    requestHeaders: input.enabled ? { secGpc: "1" } : {}, sourceScanner: "pre_consent_runtime",
    scenario: "baseline_pre_consent", consentStateAtTime: "pre_consent", pagePhase: "network_idle", confidence: 1, directVsInferred: "direct",
  });
  return canonicalEvidenceBundleSchema.parse({
    scanId: "gpc-fixture", url, normalizedUrl: url, region: "local", startedAt: at, completedAt: at,
    schemaVersion: "certscore.v2.canonical_evidence_bundle.v1", scannerVersion: "fixture",
    scanProfile: { enabledModules: [], internalBudgetMs: 5000, targetDurationMs: 5000, label: "tiny", profileId: "tiny" },
    modulesRun: [{ moduleName: "preConsentRuntimeScanner", status: "completed", startedAt: at,
      timingBreakdown: [{ label: "passive evidence quiet wait", outcome: "completed", durationMs: 250 }] }],
    scanLaneRuns: [{ laneId: lane, physicalInvocationId: lane, region: "local", phaseName: "preConsentRuntimeScanner",
      startedAt: at, firstResponseAt: at, firstResponseOffsetMs: 0, firstHttpStatus: 200, firstEffectiveUrl: url,
      navigationCount: 1, challengeDetected: false, challengeType: null, executionOutcome: "success",
      accessOutcome: "representative_page", completedAt: at, durationMs: 1000 }],
    gpcSignalObservation: { contractVersion: "certscore.gpc-signal-observation.v1", expectedEnabled: input.enabled,
      documentUrlSha256: createHash("sha256").update(url).digest("hex"), contextConfigSha256: "c".repeat(64),
      capturedAtMs: 1000, documentStartedAtMs: 0, frameCount: 1, workerCount: 0, limitationKeys: [],
      frames: [{ mainFrame: true, navigatorValue: input.enabled, documentUrlSha256: createHash("sha256").update(url).digest("hex") }] },
    networkEvents: [request(`${lane}_document`, url, 0, true), ...vendors.map((v, i) => request(`vendor_${i}`, `https://vendor${i}.test/pixel`, v.atMs ?? 500, false))],
    normalizedVendorObservations: vendors.map((v, i) => ({ observationId: `obs_${i}`, entity: v.name, vendor: v.name, product: "pixel",
      purpose: v.purpose ?? "advertising", confidence: 1, basis: ["fixture"], matchedEvidenceIds: [`vendor_${i}`] })),
    runtimeCoverage: { coverageStatus: "usable", observationCounts: {} },
    artifactRefs: [], cmpRuntimeObservations: [], consentUiObservations: [], cookieEvents: [], cookieSnapshots: [],
    derivedRuntimeSignals: { preConsentTrackingObserved: false, sessionReplayOrBehavioralAnalyticsObserved: false,
      thirdPartyCookiesPreConsentObserved: false, thirdPartyVendorsObserved: vendors.length > 0 },
    domSnapshots: [], iframeEvents: [], policySurfaceObservations: [], runtimeTimeline: [], screenshots: [], scriptEvents: [], storageSnapshots: [],
  });
}
