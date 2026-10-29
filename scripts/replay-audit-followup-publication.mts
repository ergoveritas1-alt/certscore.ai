/** Original-byte local publication counterfactual; all DB/S3/network I/O mocked. */
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { isScanReportProjectionSourceEvent } = require("../apps/web/server/scans/scan-report-projection-generation");
const { redirectPublicationHarness } = require("../apps/web/server/scans/redirect-publication.fixture");
const out = process.argv[2]; assert.ok(out, "Supply a fresh output JSON path");
const read = (file: string) => JSON.parse(readFileSync(file, "utf8"));
const hash = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
const base = "/Users/benmasek/WC01/artifacts/daily-scan-audit/runs/";
const cases = [
  { id: "e6d611f2-e3b9-4fe2-a9e5-d20bb7f4ae0b", root: base + "20261027T044232Z-manual-audit-1e655977", version: "usable_starting_page_score.v3-apex-www-recovery" },
  ...["c0c0e3d0-583c-425a-8910-0c6a026d3e4f", "9926f180-3347-4c74-b404-c70e3d98f0af"].map(id => ({ id, root: base + "20261026T142223Z-scheduled-23dced66", version: "usable_starting_page_score.v2-independent-visit" })),
];
const objects = new Map<string, Buffer>();
const inputReceipts: any[] = [];
for (const { id, root } of cases) {
  for (const receipt of [...read(root + "/evidence-retrieval-receipts.json"), ...read(root + "/support-retrieval-receipts.json")].filter((r: any) => r.scanId === id && r.verified && r.localPath)) {
    const bytes = readFileSync(receipt.localPath);
    assert.equal(hash(bytes), receipt.sha256); assert.equal(bytes.length, receipt.bytes);
    const uri = new URL(receipt.uri); objects.set(uri.hostname + uri.pathname, bytes);
    inputReceipts.push({ scanId: id, file: receipt.localPath, sha256: receipt.sha256, bytes: receipt.bytes });
  }
}
const { S3Client } = createRequire(import.meta.url)("@aws-sdk/client-s3");
const previousSend = S3Client.prototype.send, previousFetch = globalThis.fetch;
S3Client.prototype.send = async function(command: any) {
  const bytes = objects.get(command.input.Bucket + "/" + command.input.Key);
  assert.ok(bytes, "Missing retained object; no network fallback");
  return { ContentLength: bytes.length, Body: bytes };
};
globalThis.fetch = async () => { throw new Error("Network disabled for retained replay"); };
const harness = await redirectPublicationHarness(); const results = [];
try {
  for (const { id, root, version } of cases) {
    const item = read(root + "/work-inventory-v2.json").find((row: any) => row.id === id);
    assert.ok(item);
    const events = read(`${root}/scans/${id}/persisted/events.json`).map((event: any) => ({ id: event.id, eventType: event.type, createdAt: event.at, metadataJson: event.metadata })).filter((event: any) => isScanReportProjectionSourceEvent(event.eventType));
    // Minimal publisher adapter; provenance comes from original events and
    // verified original artifacts, not newly captured or synthetic evidence.
    const record = { scan: { id, domainHostname: item.hostname, status: "completed", scanType: "full", scanFromValue: item.scan_from,
      createdAt: item.created_at, startedAt: item.started_at, completedAt: item.completed_at, pagesRequested: 1, pagesScanned: 1,
      scanConfigJson: { processor: "local-certscore-v2-dag-parallel-v1", hostname: item.hostname, normalizedUrl: `https://${item.hostname}/`,
        execution: { v2DagParallel: { localOnly: true, artifactOnly: true, profile: "standard" } } } },
      signalEnrichmentWorkflow: { findingsReady: true, mergedSignalsReady: true }, events, pageEvidence: [], policyEnrichment: [], policyReviewQueue: [],
      preconsentViolations: [], primaryPolicyEnrichment: null, runtimeArtifacts: {}, signals: [], snapshot: {}, trackerVendors: [], validationFindings: [] };
    harness.state.record = record; harness.state.writes.length = 0;
    const publication = await harness.pipeline.publishCanonicalScanReportProjection({ organizationId: null, scanId: id, publicationTrigger: "authorized_worker" });
    const params = harness.state.writes.find((row: any) => row.sql.includes("insert into public.scan_snapshots"))?.params;
    assert.ok(params, "Local publication must persist a verified report");
    const published = harness.pipeline.readPersistedScanReportProjection({ scan: record.scan, snapshot: {
      report_projection_version: params[28], report_projection_status: "ready", report_projection_computed_at: item.completed_at,
      report_projection_payload: JSON.parse(params[37]), report_projection_payload_sha256: params[38], report_projection_payload_size_bytes: params[39],
    } });
    assert.ok(published);
    const api = harness.pipeline.buildApiV2ScanResource(published), report = harness.pipeline.buildCanonicalReportExport(published);
    const proof = JSON.parse(params[30]).californiaPrivacyReview?.observedScoreBasis;
    assert.equal(proof?.policyVersion, version);
    assert.equal(typeof api.postureScores?.gdprEprivacy.score, "number"); assert.equal(typeof api.postureScores?.ccpaCpra.score, "number");
    assert.equal(api.score, report.score.value); assert.equal(api.postureScores.ccpaCpra.score, report.californiaScore.score);
    results.push({ scanId: id, publicationStatus: publication.status, eu: api.postureScores.gdprEprivacy.score, california: api.postureScores.ccpaCpra.score,
      proofVersion: proof.policyVersion, payloadSha256: params[38], scope: "Local counterfactual only; historical reports and requests unchanged" });
  }
  writeFileSync(out, JSON.stringify({ results, inputReceipts, productionCalls: 0, newScans: 0, historicalWrites: 0 }, null, 2) + "\n", { flag: "wx" });
  console.log(JSON.stringify({ passed: results.length, results }));
} finally { await harness.close(); S3Client.prototype.send = previousSend; globalThis.fetch = previousFetch; }
