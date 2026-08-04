import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  buildRetainedRenderedPolicyFallbackResult,
  policySurfaceRequiredForUnboundedOutput,
} from "./index.js";

test("planned-parallel production scans retain complete policy output", () => {
  assert.equal(policySurfaceRequiredForUnboundedOutput({
    captureReplay: false,
    earlyConfirmedNoGo: false,
    plannedParallel: true,
    policySurfaceEnabled: true,
  }), true);
});

test("sequential and replay scans retain the complete policy output", () => {
  assert.equal(policySurfaceRequiredForUnboundedOutput({
    captureReplay: false,
    earlyConfirmedNoGo: false,
    plannedParallel: false,
    policySurfaceEnabled: true,
  }), true);
  assert.equal(policySurfaceRequiredForUnboundedOutput({
    captureReplay: true,
    earlyConfirmedNoGo: false,
    plannedParallel: true,
    policySurfaceEnabled: true,
  }), true);
});

test("confirmed no-go scans do not wait for policy output", () => {
  assert.equal(policySurfaceRequiredForUnboundedOutput({
    captureReplay: false,
    earlyConfirmedNoGo: true,
    plannedParallel: true,
    policySurfaceEnabled: true,
  }), false);
});

test("confirmed no-go scans cancel and settle unused policy work before returning", async () => {
  const source = await readFile(new URL("./index.ts", import.meta.url), "utf8");
  const cancellationStart = source.indexOf('phaseRecorder.record("policy_surface_no_go_cancellation", "started"');
  const cancellationAbort = source.indexOf("policySurfaceAbortController.abort(", cancellationStart);
  const cancellationSettle = source.indexOf("await policySurfaceResultPromise", cancellationAbort);

  assert.ok(cancellationStart >= 0);
  assert.ok(cancellationAbort > cancellationStart);
  assert.ok(cancellationSettle > cancellationAbort);
});

test("production policy output is bounded by its absolute deadline before final artifact publication", async () => {
  const source = await readFile(new URL("./index.ts", import.meta.url), "utf8");
  const outputStart = source.indexOf('phaseRecorder.record("policy_surface_for_output"');
  const boundedWait = source.indexOf("settlePolicySurfaceBeforeDeadline(\n        policySurfaceResultPromise", outputStart);
  const deadlineAbort = source.indexOf("policySurfaceAbortController.abort(", boundedWait);
  const renderedFallback = source.indexOf("buildRetainedRenderedPolicyFallbackResult", deadlineAbort);

  assert.ok(outputStart >= 0);
  assert.ok(boundedWait > outputStart);
  assert.ok(deadlineAbort > boundedWait);
  assert.ok(renderedFallback > deadlineAbort);
});

test("unsettled policy output retains typed rendered-link evidence as a partial module result", () => {
  const result = buildRetainedRenderedPolicyFallbackResult({
    completedAtMs: 2_500,
    startedAtMs: 1_000,
    observations: [{
      observationId: "rendered-privacy",
      surfaceType: "privacy_policy",
      url: "https://example.test/privacy",
      normalizedUrl: "https://example.test/privacy",
      discoveryMethod: "footer_link",
      status: "observed",
      linkObservationState: "observed",
      documentFetchState: "not_attempted",
      documentEvaluationState: "not_attempted",
      confidence: 0.9,
    } as never],
  });

  assert.equal(result.moduleRun.status, "partial");
  assert.equal(result.moduleRun.durationMs, 1_500);
  assert.deepEqual(result.moduleRun.recoveryDiagnostics?.modes, ["pre_consent_rendered_policy_link_handoff"]);
  assert.equal(result.policySurfaceObservations[0]?.normalizedUrl, "https://example.test/privacy");
});
