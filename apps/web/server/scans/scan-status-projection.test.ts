import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const serverOnlyPath = require.resolve("server-only");
(require.cache as Record<string, unknown>)[serverOnlyPath] = {
  exports: {},
  filename: serverOnlyPath,
  id: serverOnlyPath,
  isPreloading: false,
  loaded: true,
  path: serverOnlyPath,
  paths: []
};

import type { ScanStatusProjection } from "./scan-status-projection";

let buildLightweightScanStatusResponse: typeof import("./scan-status-projection").buildLightweightScanStatusResponse;
let buildLightweightApiV2ScanStatusInput: typeof import("./scan-status-projection").buildLightweightApiV2ScanStatusInput;

async function getBuildLightweightScanStatusResponse() {
  buildLightweightScanStatusResponse ??= (await import("./scan-status-projection")).buildLightweightScanStatusResponse;
  return buildLightweightScanStatusResponse;
}

async function getBuildLightweightApiV2ScanStatusInput() {
  buildLightweightApiV2ScanStatusInput ??= (await import("./scan-status-projection")).buildLightweightApiV2ScanStatusInput;
  return buildLightweightApiV2ScanStatusInput;
}

function projection(overrides: Partial<ScanStatusProjection> = {}): ScanStatusProjection {
  return {
    completedAt: "2026-07-29T18:44:40.000Z",
    createdAt: "2026-07-29T18:44:17.000Z",
    domainHostname: "example.com",
    pageUrl: "https://example.com/",
    errorMessage: null,
    id: "e77dfaed-f1b0-4993-bd1f-5d913e595c4a",
    organizationId: null,
    profile: "standard",
    postRefusalObservationExpected: false,
    reportGeneration: null,
    reportInputsReady: false,
    reportProjectionRequired: true,
    reportReady: false,
    browserExtensionNormalizationReady: false,
    startedAt: "2026-07-29T18:44:17.000Z",
    status: "completed",
    ...overrides
  };
}

test("lightweight status keeps completed scans finalizing without a canonical projection", async () => {
  const build = await getBuildLightweightScanStatusResponse();
  const response = build(projection());
  assert.equal(response.reportReadiness.status, "finalizing");
  assert.equal(response.scan.status, "completed");
  assert.equal(response.progress.stage, "review");
});

test("lightweight status keeps completed-limited scans finalizing without a canonical projection", async () => {
  const build = await getBuildLightweightScanStatusResponse();
  const response = build(projection({ status: "completed_limited" }));
  assert.equal(response.reportReadiness.status, "finalizing");
  assert.equal(response.scan.status, "completed_limited");
});

test("lightweight status keeps recent completed scans finalizing", async () => {
  const build = await getBuildLightweightScanStatusResponse();
  const response = build(
    projection({ completedAt: new Date().toISOString() })
  );
  assert.equal(response.reportReadiness.status, "finalizing");
});

test("lightweight status exposes a recent completed scan as soon as its current projection is ready", async () => {
  const build = await getBuildLightweightScanStatusResponse();
  const response = build(
    projection({
      completedAt: new Date().toISOString(),
      reportGeneration: "generation-1",
      reportReady: true
    })
  );
  assert.equal(response.reportReadiness.status, "ready");
  assert.equal(response.reportReadiness.generation, "generation-1");
  assert.equal(response.scan.status, "completed");
  assert.equal(response.progress.stage, "complete");
});

test("lightweight status exposes canonical scan, review, and report milestones", async () => {
  const build = await getBuildLightweightScanStatusResponse();
  assert.equal(build(projection({ status: "running" })).progress.stage, "scan");
  assert.equal(build(projection({ reportInputsReady: false, status: "completed" })).progress.stage, "review");
  assert.equal(build(projection({ reportInputsReady: true, status: "completed" })).progress.stage, "report");
});

test("lightweight status does not apply the fallback to non-completed scans", async () => {
  const build = await getBuildLightweightScanStatusResponse();
  const response = build(projection({ status: "running" }));
  assert.equal(response.reportReadiness.status, "finalizing");
});

test("API v2 lightweight status never promotes completed work before its report projection is ready", async () => {
  const build = await getBuildLightweightApiV2ScanStatusInput();
  const response = build(projection({
    pagesRequested: 1,
    pagesScanned: 1,
    reportReady: false,
    score: 92,
    status: "completed",
  }));

  assert.equal(response.status, "finalizing");
  assert.equal(response.score, null);
  assert.equal(response.scoreStatus, "provisional");
});

test("API v2 lightweight status exposes a persisted preview without promoting the active scan", async () => {
  const build = await getBuildLightweightApiV2ScanStatusInput();
  const response = build(projection({
    completedAt: null,
    preConsentPreview: {
      type: "certscore_pre_consent_preview",
      resultStage: "preliminary",
      final: false,
      sourceLane: "runtime_evidence",
      generatedAt: "2026-08-28T18:00:03.000Z",
      runtimeCoverage: { status: "usable", limitationKeys: [] },
      summary: { cookieCount: 1, trackerCount: 1, thirdPartyRequestCount: 1, vendorCount: 1 },
      cookies: [{
        name: "_ga",
        domain: "example.com",
        party: "first_party",
        purpose: "analytics",
        essentiality: "non_essential",
        observedAtMs: 1_200,
      }],
      trackers: [{
        vendor: "Google",
        product: "Google Analytics",
        purpose: "analytics",
        confidence: 0.96,
        domains: ["www.google-analytics.com"],
      }],
      truncated: { cookies: false, trackers: false },
      mustContinuePolling: true,
      observationOnlyDisclaimer: "Preliminary passive observations only; continue polling for the canonical result.",
    },
    reportReady: false,
    status: "running",
  }));

  assert.equal(response.status, "running");
  assert.equal(response.score, null);
  assert.equal(response.preConsentPreview?.final, false);
  assert.equal(response.preConsentPreview?.mustContinuePolling, true);
  assert.equal(response.preConsentPreview?.summary.cookieCount, 1);
});

test("API v2 lightweight status exposes only persisted terminal score metadata", async () => {
  const build = await getBuildLightweightApiV2ScanStatusInput();
  const response = build(projection({
    lastHeartbeatAt: "2026-07-29T18:44:41.000Z",
    pagesRequested: 1,
    pagesScanned: 1,
    reportReady: true,
    scanFrom: "eu_ie",
    score: 92,
    scoreUpdatedAt: "2026-07-29T18:44:41.000Z",
    scoreVersion: "overall-score.v1",
  }));

  assert.equal(response.status, "completed");
  assert.equal(response.score, 92);
  assert.equal(response.scoreStatus, "final");
  assert.equal(response.scoreVersion, "overall-score.v1");
  assert.equal(response.scanFrom, "eu_ie");
  assert.equal(response.lastHeartbeatAt, "2026-07-29T18:44:41.000Z");
});

test("API v2 lightweight status projects retained no-go assessment without report hydration", async () => {
  const build = await getBuildLightweightApiV2ScanStatusInput();
  const response = build(projection({
    reportReady: false,
    scanNoGoAssessment: {
      decision: "no_go",
      reasonCodes: ["target_access_denied"],
    },
    status: "completed",
  }));

  assert.equal(response.status, "completed_limited");
  assert.equal(response.resultDisposition, "no_go");
  assert.equal(response.score, null);
});

test("API v2 lightweight status fails closed when persisted report projection failed", async () => {
  const build = await getBuildLightweightApiV2ScanStatusInput();
  const response = build(projection({
    reportProjectionStatus: "failed",
    reportReady: false,
    status: "completed",
  }));

  assert.equal(response.status, "failed");
  assert.equal(response.error?.code, "report_projection_failed");
  assert.equal(response.score, null);
});

test("API v2 status route uses bounded status and persisted-report reads only", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile("apps/web/app/api/v2/scans/[scanId]/status/route.ts", "utf8");

  assert.match(source, /getAnonymousScanStatusProjection/);
  assert.match(source, /loadAnonymousPersistedScanReportProjection/);
  assert.match(source, /buildLightweightApiV2ScanStatusInput/);
  assert.doesNotMatch(source, /getPublicScanRecord/);
  assert.doesNotMatch(source, /materializeLocalV2DagScanDetail/);
});
