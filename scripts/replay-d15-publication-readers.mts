/** Local retained-only D15 replay. No environment loading, scans, or network. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve, join } from "node:path";

const args = process.argv.slice(2);
const runDir = resolve(args[args.indexOf("--run-dir") + 1] ?? "");
const outDir = resolve(args[args.indexOf("--out-dir") + 1] ?? "");
assert.ok(args.includes("--run-dir") && args.includes("--out-dir"), "Supply --run-dir and a separate --out-dir");
assert.ok(outDir !== runDir && !outDir.startsWith(runDir + "/"), "Preserve immutable audit artifacts");
const require = createRequire(import.meta.url);
let raw: any = null;
let row: any = null;
let materializations = 0;
let readQueries = 0;
function stub(path: string, exports: Record<string, unknown>) {
  const id = require.resolve(path);
  require.cache[id] = { id, filename: id, loaded: true, exports } as NodeModule;
}
stub("server-only", {});
stub("@website-signal-risk-scanner/db", { queryOne: async (_sql: string, _args: unknown, options: any) => {
  assert.equal(options.readOnly, true); readQueries++; return row;
} });
stub("../apps/web/server/scans/get-scan-by-id", { getAnonymousScanByIdForReadOnlyProjection: async () => raw });
stub("../apps/web/server/scans/local-v2-dag-report", { materializeLocalV2DagScanDetail: async () => {
  materializations++; throw new Error("Retained modern reads must never materialize");
} });
const previousFetch = globalThis.fetch;
globalThis.fetch = async () => { throw new Error("Network forbidden in retained replay"); };
const { getPublicScanRecord } = require("../apps/web/server/scans/get-public-scan-record");
const { buildApiV2ScanResource, buildApiV2ScanStatus, buildApiV2ScanJobFromPulseStatus } = require("../apps/web/lib/api-v2/scan-resource");
const { buildLightweightApiV2ScanStatusInput } = require("../apps/web/server/scans/scan-status-projection");
const { buildPulseProjection } = require("../apps/web/lib/pulse/projection");
const { CertScoreClient, CertScoreScanFailedError } = await import("../packages/certscore-sdk/src/index.js");
const { withMcpAgentGuidance } = await import("../packages/certscore-mcp/src/tools.js");
const manifest = JSON.parse(readFileSync(join(runDir, "immutable-artifact-manifest.json"), "utf8"));
const receipts: any[] = [];
function retained(file: string) {
  const absolute = join(runDir, file);
  const bytes = readFileSync(absolute);
  const entry = manifest.files.find((entry: any) => entry.file === absolute);
  assert.ok(entry, `Missing manifest entry: ${file}`);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  assert.equal(sha256, entry.sha256);
  assert.equal(bytes.length, entry.bytes);
  receipts.push({ file, sha256, bytes: bytes.length, verified: true });
  return JSON.parse(bytes.toString("utf8"));
}
const failures = retained("publication-trace.json");
const inventory = retained("mechanical-work-inventory.json");
const results: any[] = [];
for (const failure of failures) {
  const scan = inventory.find((scan: any) => scan.id === failure.scanId);
  assert.ok(scan);
  raw = {
    scan: { id: scan.id, domainHostname: scan.hostname, status: failure.status, createdAt: failure.createdAt,
      startedAt: scan.started_at, completedAt: failure.completedAt, scanFromValue: scan.scan_from,
      scanConfigJson: null, pagesRequested: 1, pagesScanned: 1 },
    events: failure.events.map((event: any) => ({ eventType: event.type, createdAt: event.at })),
    reportPublication: { requestStatus: failure.request.status, snapshotPersisted: failure.snapshot.present, projectionVerified: false },
    snapshot: null, runtimeArtifacts: {}, accessPostureSummary: {}, domainBenchmark: null, policyEnrichment: [],
    policyReviewQueue: [], preconsentViolations: [], regulatoryRisk: null, signals: [], trackerVendors: [], validationFindings: [],
  };
  const before = JSON.stringify(raw);
  row = null;
  const record = await getPublicScanRecord(scan.id);
  const api = buildApiV2ScanResource(record);
  const status = buildApiV2ScanStatus(record);
  const lightweight = buildApiV2ScanJobFromPulseStatus(buildLightweightApiV2ScanStatusInput({
    id: scan.id, status: failure.status, publicationRequestStatus: failure.request.status,
    createdAt: failure.createdAt, startedAt: scan.started_at, completedAt: failure.completedAt,
    domainHostname: scan.hostname, reportReady: false, reportProjectionRequired: true, score: 79,
  }));
  for (const value of [status, lightweight]) {
    assert.equal(value.status, "failed"); assert.equal(value.score, null);
    assert.equal(value.error.code, "report_publication_failed"); assert.equal(value.error.retryable, false);
    assert.equal(value.retryAfterSeconds, null); assert.equal(value.preConsentPreview, undefined);
  }
  assert.equal(api.score, null); assert.equal(api.postureScores, undefined);
  const pulse = buildPulseProjection({ scanRecord: record, detail: "standard", format: "json", freshnessMode: "latest",
    pulseRequestId: "d15-retained", requestedUrl: null, resolutionMode: "retained-replay", waitSeconds: 0 });
  assert.equal(pulse.scanStatus, "failed"); assert.equal(pulse.summary.score, null);
  const mcp = withMcpAgentGuidance(lightweight);
  assert.equal(mcp.recommendedNextTool, null); assert.equal(mcp.retryAfterSeconds, null);
  let statusReads = 0;
  globalThis.fetch = async (url: any) => {
    assert.ok(String(url).endsWith(`/api/v2/scans/${scan.id}/status`)); statusReads++;
    assert.equal(statusReads, 1, "No repeated polling");
    return new Response(JSON.stringify(lightweight), { status: 200, headers: { "content-type": "application/json" } });
  };
  await assert.rejects(() => new CertScoreClient().scans.wait({ ...lightweight, status: "running", error: undefined }, { pollIntervalMs: 0 }),
    (error: unknown) => error instanceof CertScoreScanFailedError && error.code === "report_publication_failed");
  assert.equal(statusReads, 1);
  globalThis.fetch = async () => { throw new Error("Network forbidden in retained replay"); };
  assert.equal(JSON.stringify(raw), before);
  results.push({ scanId: scan.id, kind: "original_terminal_failure", request: failure.request,
    snapshot: failure.snapshot, originalProcessorConfig: "not exported; modern provenance established by retained v2 result event",
    result: { publicStatus: record.scan.status, apiStatus: api.status, score: api.score, pulseScore: pulse.summary.score,
      statusError: status.error, mcpNextTool: mcp.recommendedNextTool, sdkStatusReads: statusReads }, passed: true });
}
for (const scanId of ["bd3fa878-2dfa-4659-9765-99d0ccb46a81", "16df7943-a28b-4d0e-a852-c65581a07130"]) {
  const snapshot = retained(`scans/${scanId}/persisted/snapshot.json`);
  const baseline = retained(`scans/${scanId}/offline-verified/api.json`);
  const before = JSON.stringify(snapshot);
  row = { ...snapshot, publication_request_status: null };
  const record = await getPublicScanRecord(scanId);
  assert.equal(record.reportPublication.projectionVerified, true);
  const api = buildApiV2ScanResource(record);
  const status = buildApiV2ScanStatus(record);
  assert.equal(status.status, baseline.status); assert.equal(api.score, snapshot.certscore_overall);
  assert.equal(api.score, baseline.score);
  assert.deepEqual(api.postureScores, baseline.postureScores);
  const pulse = buildPulseProjection({ scanRecord: record, detail: "summary", format: "json", freshnessMode: "latest",
    pulseRequestId: "d15-historical-ready", requestedUrl: null, resolutionMode: "retained-replay", waitSeconds: 0 });
  assert.equal(pulse.summary.score, api.score);
  assert.deepEqual(pulse.summary.postureScores, api.postureScores);
  assert.ok(api.postureScores.gdprEprivacy.score !== null && api.postureScores.ccpaCpra.score !== null);
  assert.equal(JSON.stringify(snapshot), before);
  results.push({ scanId, kind: "original_historical_verified_ready", reportVersion: snapshot.report_projection_version,
    payloadSha256: snapshot.report_projection_payload_sha256, sourceHash: snapshot.report_projection_source_hash,
    requestState: "not exported for control; left unknown", score: api.score, postureScores: api.postureScores, passed: true });
}
assert.equal(materializations, 0);
globalThis.fetch = previousFetch;
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "retained-reader-replay.json"), JSON.stringify({ runDir, receipts, results, readQueries,
  materializations, productionCalls: 0, recurringLocalCostUsd: 0,
  scope: "Original retained operational failures and checksum-verified ready payloads; no upstream repair, production verification or issue closure." }, null, 2) + "\n");
console.log(JSON.stringify({ failuresPassed: failures.length, historicalReadyPassed: results.length - failures.length, materializations, productionCalls: 0 }));
