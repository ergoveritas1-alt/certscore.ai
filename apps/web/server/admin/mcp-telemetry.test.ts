import assert from "node:assert/strict";
import test from "node:test";
import { calculateMcpTelemetryRates } from "../../lib/admin/mcp-telemetry-rates";

test("MCP telemetry aggregation rates use the correct denominators", () => {
  assert.deepEqual(calculateMcpTelemetryRates({
    bundles: 30,
    errors: 5,
    invocations: 100,
    newScans: 30,
    quotaLimited: 4,
    reusedScans: 20,
    scans: 50,
    statusPolls: 75,
  }), {
    bundlePerScanRatio: 0.6,
    errorRate: 0.05,
    quotaHitRate: 0.04,
    scanReuseRate: 0.4,
    statusPollsPerScanRatio: 1.5,
  });
});

test("MCP telemetry aggregation reports unavailable rates without fabricated zeroes", () => {
  assert.deepEqual(calculateMcpTelemetryRates({
    bundles: 0, errors: 0, invocations: 0, newScans: 0,
    quotaLimited: 0, reusedScans: 0, scans: 0, statusPolls: 0,
  }), {
    bundlePerScanRatio: null,
    errorRate: null,
    quotaHitRate: null,
    scanReuseRate: null,
    statusPollsPerScanRatio: null,
  });
});
