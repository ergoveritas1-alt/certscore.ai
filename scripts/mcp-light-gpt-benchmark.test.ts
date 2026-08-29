import assert from "node:assert/strict";
import test from "node:test";
import { buildReport, bundleMatchesTarget, classifyInitial, percentile, renderMarkdown, summarizeLatency, type BenchmarkCaseResult } from "./mcp-light-gpt-benchmark";

test("percentiles use deterministic nearest-rank values", () => {
  assert.equal(percentile([40, 10, 30, 20], 50), 20);
  assert.equal(percentile([40, 10, 30, 20], 95), 40);
  assert.deepEqual(summarizeLatency([null, 10, 20, 30]), {
    count: 3,
    min: 10,
    p50: 20,
    p90: 30,
    p95: 30,
    p99: 30,
    max: 30,
  });
});

test("initial classification distinguishes pending, reuse, quota, and invalid results", () => {
  assert.equal(classifyInitial({ status: "queued", scanId: "scan" }, false), "new_pending_scan");
  assert.equal(classifyInitial({ status: "completed", reused: true, scanId: "scan" }, false), "immediate_completed_reuse");
  assert.equal(classifyInitial({ status: "rate_limited", error: { code: "scan_quota_exceeded" } }, true), "admission_limited");
  assert.equal(classifyInitial({ status: "invalid_arguments", error: { code: "invalid_url" } }, true), "invalid_error");
});

test("bundle validation binds scan ID and normalized target host", () => {
  assert.deepEqual(
    bundleMatchesTarget(
      { scanId: "scan-1", domain: "www.example.com" },
      { scanId: "scan-1", domain: "example.com" },
      { id: "case", category: "normal", target: "https://example.com/path" },
    ),
    { scanIdMatched: true, targetMatched: true },
  );
  assert.equal(bundleMatchesTarget(
    { scanId: "scan-2", domain: "example.com" },
    { scanId: "scan-1", domain: "example.com" },
    { id: "case", category: "normal", target: "https://example.com" },
  ).scanIdMatched, false);
});

test("report detects an eliminated long initial hold and renders reusable markdown", () => {
  const base = {
    id: "case-1",
    category: "normal_public_site",
    target: "https://example.com",
    clientIdentifier: "benchmark-case-1",
    mcpSessionId: "session",
    startedAt: "2026-01-01T00:00:00.000Z",
    completedAt: "2026-01-01T00:00:02.000Z",
    initializationSuccess: true,
    initializationLatencyMs: 20,
    toolDiscoverySuccess: true,
    toolDiscoveryLatencyMs: 10,
    discoveredTools: ["certscore_scan_site", "certscore_get_scan_status", "certscore_get_scan_bundle"],
    contractChecks: {},
    scanSiteCallCount: 1,
    scanSiteStartedAt: "2026-01-01T00:00:00.100Z",
    initialResponseLatencyMs: 500,
    initialClassification: "immediate_completed_reuse",
    initialStatus: "completed",
    scanId: "scan-1",
    retryAfterSeconds: null,
    legacyWaitParametersSent: false,
    statusPolls: [],
    parallelPollCount: 0,
    accidentalDuplicateScanCount: 0,
    terminalStatus: "completed",
    terminalReached: true,
    scanCompletionTimeMs: 500,
    bundleAttempted: true,
    bundleRetrieved: true,
    bundleLatencyMs: 100,
    bundleScanIdMatched: true,
    bundleTargetMatched: true,
    totalEndToEndMs: 700,
    finalResult: "success",
    httpObservations: [],
    httpErrorCount: 0,
    mcpErrorCount: 0,
    timeout: false,
    disconnect: false,
    telemetryRecorded: "not_client_observable" as const,
    telemetryCorrelation: { clientIdentifier: "benchmark-case-1", sessionId: "session", timeWindowStart: "start", timeWindowEnd: "end" },
    error: null,
  } satisfies BenchmarkCaseResult;
  const commonDescription = "returns promptly and never waits; retryAfterSeconds certscore_get_scan_status do not resubmit certscore_scan_site";
  const report = buildReport({
    runId: "run",
    endpoint: "https://mcp.certscore.ai/mcp/light",
    startedAt: base.startedAt,
    completedAt: base.completedAt,
    targetsPath: "targets.json",
    concurrency: 1,
    timeoutSeconds: 600,
    pollFallbackSeconds: 5,
    interCaseDelaySeconds: 2,
    results: [
      base,
      {
        ...base,
        id: "case-2",
        clientIdentifier: "benchmark-case-2",
        initialClassification: "new_pending_scan",
        initialStatus: "queued",
        initialResponseLatencyMs: 700,
        legacyWaitParametersSent: true,
      },
    ],
    tools: [
      { name: "certscore_scan_site", description: commonDescription },
      { name: "certscore_get_scan_status", description: "never poll in parallel; never resubmit certscore_scan_site; at completed or completed_limited, call certscore_get_scan_bundle" },
      { name: "certscore_get_scan_bundle", description: "Call after completed or completed_limited" },
    ],
  });
  assert.equal(report.assessment.initialHoldEliminated, true);
  assert.equal(report.assessment.passed, true);
  assert.equal(report.assessment.readyForBroaderTraffic, true);
  assert.match(renderMarkdown(report), /Initial certscore_scan_site p95 was 700 ms/);
});
