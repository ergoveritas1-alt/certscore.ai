import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { ScanDetailResponse } from "./get-scan-by-id";

const require = createRequire(import.meta.url);
let raw: ScanDetailResponse | null = null;
let row: Record<string, unknown> | null = null;
let materializations = 0;
const queries: string[] = [];
function stub(path: string, exports: Record<string, unknown>) {
  const id = require.resolve(path);
  require.cache[id] = { id, filename: id, loaded: true, exports } as NodeModule;
}
stub("server-only", {});
stub("@website-signal-risk-scanner/db", {
  queryOne: async (sql: string, _args: unknown, options: { readOnly: boolean }) => {
    assert.equal(options.readOnly, true);
    queries.push(sql);
    return row;
  },
});
stub("./get-scan-by-id", { getAnonymousScanByIdForReadOnlyProjection: async () => raw });
stub("./local-v2-dag-report", {
  materializeLocalV2DagScanDetail: async (record: ScanDetailResponse) => { materializations++; return record; },
});
const { getPublicScanRecord } = require("./get-public-scan-record") as typeof import("./get-public-scan-record");
const { loadPersistedScanReportProjection } = require("./scan-report-projection") as typeof import("./scan-report-projection");
const { buildPersistedScanReportProjection, SCAN_REPORT_PROJECTION_VERSION, readPersistedScanReportProjection } = require("./scan-report-projection-contract") as typeof import("./scan-report-projection-contract");
const { buildApiV2ScanResource, buildApiV2ScanStatus, buildApiV2ScanJobFromPulseStatus } = require("../../lib/api-v2/scan-resource") as typeof import("../../lib/api-v2/scan-resource");
const { buildLightweightApiV2ScanStatusInput } = require("./scan-status-projection") as typeof import("./scan-status-projection");
const { buildPulseProjection } = require("../../lib/pulse/projection") as typeof import("../../lib/pulse/projection");
const retained = JSON.parse(readFileSync(new URL("./test-fixtures/report-publication-failures.json", import.meta.url), "utf8"));

function record(id: string): ScanDetailResponse {
  return {
    scan: { id, domainHostname: "example.com", status: "completed", pagesRequested: 1, pagesScanned: 1,
      createdAt: "2026-10-26T00:00:00Z", startedAt: null, completedAt: "2026-10-26T00:01:00Z", scanConfigJson: null,
      scanFromValue: "eu_ie", scanFromLabel: "Ireland" },
    accessPostureSummary: {}, domainBenchmark: null, events: [], policyEnrichment: [], policyReviewQueue: [],
    preconsentViolations: [], regulatoryRisk: null, runtimeArtifacts: {}, signals: [], trackerVendors: [], validationFindings: [],
    snapshot: { certscore_overall: 79 },
  } as unknown as ScanDetailResponse;
}

test("three retained terminal publications stop public/API/Pulse reads without materialization", async () => {
  for (const failure of retained.failures) {
    raw = record(failure.scanId);
    raw.scan.status = failure.status;
    raw.scan.createdAt = failure.createdAt;
    raw.scan.completedAt = failure.completedAt;
    raw.events = failure.events;
    raw.snapshot = null;
    raw.reportPublication = { requestStatus: failure.request.status, snapshotPersisted: failure.snapshot.present, projectionVerified: false };
    row = null;
    const before = structuredClone(raw);
    const result = await getPublicScanRecord(failure.scanId);
    assert.ok(result);
    assert.equal(result.scan.status, "failed");
    const resource = buildApiV2ScanResource(result);
    const status = buildApiV2ScanStatus(result);
    assert.equal(resource.score, null);
    assert.equal(resource.postureScores, undefined);
    assert.equal(status.error?.code, "report_publication_failed");
    assert.equal(status.retryAfterSeconds, null);
    const lightweight = buildApiV2ScanJobFromPulseStatus(buildLightweightApiV2ScanStatusInput({
      id: failure.scanId, status: failure.status, publicationRequestStatus: failure.request.status,
      createdAt: failure.createdAt, startedAt: null, completedAt: failure.completedAt, domainHostname: "example.com",
      reportReady: false, score: 79, reportProjectionRequired: true, reportProjectionStatus: failure.snapshot.status,
    } as any));
    assert.equal(lightweight.status, "failed");
    assert.equal(lightweight.score, null);
    assert.equal(lightweight.preConsentPreview, undefined);
    assert.equal(lightweight.retryAfterSeconds, null);
    const pulse = buildPulseProjection({ scanRecord: result, detail: "standard", format: "json", freshnessMode: "latest",
      pulseRequestId: "retained-d15", requestedUrl: "https://example.com/", resolutionMode: "retained-test", waitSeconds: 0 });
    assert.equal((pulse.summary as { score: number | null }).score, null);
    assert.equal(pulse.scanStatus, "failed");
    assert.deepEqual(raw, before);
  }
  assert.equal(materializations, 0);
});

test("pending modern reads never repair a numeric fallback; persisted legacy remains compatible", async () => {
  raw = record("11111111-1111-4111-8111-111111111111");
  raw.events = [{ eventType: "v2_lambda_result.received" }] as any;
  row = null;
  const pending = await getPublicScanRecord(raw.scan.id);
  assert.equal(pending?.scan.status, "finalizing");
  assert.equal(materializations, 0);
  raw.events = [];
  raw.reportPublication = { requestStatus: null, snapshotPersisted: true, projectionVerified: false };
  const legacy = await getPublicScanRecord(raw.scan.id);
  assert.ok(legacy);
  assert.equal(buildApiV2ScanStatus(legacy).status, "completed");
  assert.equal(materializations, 1);
});

test("verified report cache rechecks live terminal publication and retains scope/generation binding", async () => {
  const original = record("22222222-2222-4222-8222-222222222222");
  const persisted = buildPersistedScanReportProjection(original);
  const generation = "a".repeat(64);
  row = { scan_id: original.scan.id, scan_status: "completed", publication_request_status: "completed",
    report_projection_payload: persisted.payload, report_projection_payload_sha256: persisted.sha256,
    report_projection_payload_size_bytes: persisted.sizeBytes, report_projection_status: "ready",
    report_projection_version: SCAN_REPORT_PROJECTION_VERSION, report_projection_source_hash: generation,
    report_projection_computed_at: original.scan.completedAt };
  const before = structuredClone(row);
  const ready = await loadPersistedScanReportProjection({ scanId: original.scan.id, generation });
  assert.equal(ready?.reportPublication?.projectionVerified, true);
  row = { publication_request_status: "terminal_failure" };
  assert.equal(await loadPersistedScanReportProjection({ scanId: original.scan.id, generation }), null);
  assert.match(queries.at(-1)!, /s\.organization_id = \$2/);
  assert.match(queries.at(-1)!, /report_projection_source_hash = \$3/);
  row = null;
  assert.equal(await loadPersistedScanReportProjection({ scanId: original.scan.id, generation }), null);
  assert.equal(readPersistedScanReportProjection({ scan: original.scan, snapshot: before,
    reportPublication: { requestStatus: "terminal_failure", snapshotPersisted: true, projectionVerified: true } }), null);
  assert.equal("reportPublication" in persisted.payload, false);
});
