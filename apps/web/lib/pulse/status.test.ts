import assert from "node:assert/strict";
import test from "node:test";
import { buildPulseStatus } from "./status";

test("Pulse status includes durable scan id aliases for later full report retrieval", () => {
  const status = buildPulseStatus({
    jobId: "pulse_job_123",
    scanId: "scan_abc123",
    domain: "example.com",
    status: "queued",
    phase: "queued",
    createdAt: "2026-05-18T23:15:00Z"
  });

  assert.equal(status.scanId, "scan_abc123");
  assert.equal(status.scan_id, "scan_abc123");
  assert.match(status.resultUrl ?? "", /scanId=scan_abc123/);
  assert.match(status.reportUrl ?? "", /\/scan\/scan_abc123/);
});
