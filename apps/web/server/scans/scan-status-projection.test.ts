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

async function getBuildLightweightScanStatusResponse() {
  buildLightweightScanStatusResponse ??= (await import("./scan-status-projection")).buildLightweightScanStatusResponse;
  return buildLightweightScanStatusResponse;
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
