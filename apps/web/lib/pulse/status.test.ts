import assert from "node:assert/strict";
import test from "node:test";
import { buildPulseStatus } from "./status";

test("Pulse status retains durable scan IDs but withholds report links until readiness", () => {
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
  assert.match(status.resultUrl ?? "", /jobId=pulse_job_123/);
  assert.equal(status.reportUrl, null);
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

test("Pulse status returns reason-specific completed-limited no-go messaging", () => {
  const status = buildPulseStatus({
    jobId: "pulse_job_cerebras",
    scanId: "scan_cerebras",
    domain: "cerebras.com",
    status: "completed",
    createdAt: "2026-07-10T12:00:00Z",
    noGoProjection: {
      resultDisposition: "no_go",
      noGo: {
        reasonCode: "site_not_ready",
        title: "The site is not ready for scanning",
        explanation: "The retained page was a prelaunch experience.",
        summary: "CertScore observed a prelaunch page, so substantive findings were withheld.",
        limitationKind: "target_site_state",
        recommendedNextAction: "Retry after the public website launches.",
        retryLikelyToHelp: false
      }
    }
  });
  assert.equal(status.status, "completed_limited");
  assert.equal(status.resultDisposition, "no_go");
  assert.equal(status.noGo?.reasonCode, "site_not_ready");
  assert.match(status.message, /prelaunch page/i);
  assert.doesNotMatch(status.message, /eligible public scan results/i);
});
