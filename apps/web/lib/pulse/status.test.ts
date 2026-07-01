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

test("Pulse status does not publish stale queued progress for completed scans", () => {
  const status = buildPulseStatus({
    jobId: "pulse_job_completed",
    scanId: "scan_completed123",
    domain: "example.com",
    status: "completed_limited",
    phase: "queued",
    createdAt: "2026-05-18T23:15:00Z",
    completedAt: "2026-05-18T23:17:30Z"
  });

  assert.equal(status.phase, "completed");
  assert.equal(status.progress.currentStep, "completed");
  assert.equal(status.progress.remainingSteps.length, 0);
  assert.equal(status.agentInterpretation.responseClass, "completed_pulse");
  assert.equal(status.agentInterpretation.safeSummaryUse, true);
});
