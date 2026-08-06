import assert from "node:assert/strict";
import test from "node:test";
import type { PreConsentRuntimeScannerResult } from "./scanners/pre-consent-runtime-scanner.js";
import { settlePreConsentRuntimeWithinDeadline } from "./index.js";

function retainedPartialResult(startedAtMs: number): PreConsentRuntimeScannerResult {
  const startedAt = new Date(startedAtMs).toISOString();
  return {
    moduleRun: {
      moduleName: "preConsentRuntimeScanner",
      status: "partial",
      startedAt,
      completedAt: new Date(startedAtMs + 25).toISOString(),
      durationMs: 25,
      evidenceRefs: [],
      errors: ["Retained bounded evidence after the soft deadline."],
    },
    runtimeTimeline: [],
    networkEvents: [],
    networkResponseEvents: [],
    cookieEvents: [],
    cookieSnapshots: [],
    storageSnapshots: [],
    scriptEvents: [],
    iframeEvents: [],
    consentUiObservations: [],
    collectionSurfaceObservations: [],
    cmpRuntimeObservations: [],
    transportSecurityObservations: [],
    screenshots: [],
    visualCapture: {
      status: "unavailable",
      failureReason: "unknown",
      artifactRefs: [],
      notes: [],
    },
    domSnapshots: [],
    artifactRefs: [],
    vendorResolverInputs: [],
    renderedPolicyLinks: [],
  };
}

test("outer pre-consent deadline preserves a retained result returned during shutdown grace", async () => {
  const startedAtMs = Date.now();
  let deadlineObserved = false;
  const result = await settlePreConsentRuntimeWithinDeadline({
    deadlineMs: 20,
    graceMs: 100,
    startedAtMs,
    run: (signal) => new Promise<PreConsentRuntimeScannerResult>((resolve) => {
      signal.addEventListener("abort", () => {
        deadlineObserved = true;
        setTimeout(() => resolve(retainedPartialResult(startedAtMs)), 10);
      }, { once: true });
    }),
  });

  assert.equal(deadlineObserved, true);
  assert.equal(result.moduleRun.status, "partial");
  assert.match(result.moduleRun.errors.join("; "), /retained bounded evidence/i);
});

test("outer pre-consent deadline returns an explicit bounded fallback when startup never settles", async () => {
  const startedAtMs = Date.now();
  let deadlineObserved = false;
  const beforeMs = Date.now();
  const result = await settlePreConsentRuntimeWithinDeadline({
    deadlineMs: 20,
    graceMs: 20,
    startedAtMs,
    run: (signal) => new Promise<PreConsentRuntimeScannerResult>(() => {
      signal.addEventListener("abort", () => {
        deadlineObserved = true;
      }, { once: true });
    }),
  });

  assert.equal(deadlineObserved, true);
  assert.equal(result.moduleRun.status, "skipped_budget");
  assert.equal(result.visualCapture.status, "unavailable");
  assert.equal(result.visualCapture.failureReason, "unknown");
  assert.match(result.moduleRun.errors.join("; "), /no pre-consent evidence was retained/i);
  assert.ok(Date.now() - beforeMs < 500, "fallback should settle within the bounded deadline and grace window");
});

test("outer pre-consent deadline retains the latest startup lifecycle checkpoint", async () => {
  const startedAtMs = Date.now();
  const result = await settlePreConsentRuntimeWithinDeadline({
    deadlineMs: 20,
    graceMs: 10,
    getLatestLifecycleCheckpoint: () => ({
      atMs: startedAtMs + 5,
      label: "page_navigation",
      status: "started",
    }),
    startedAtMs,
    run: () => new Promise<PreConsentRuntimeScannerResult>(() => undefined),
  });

  assert.match(result.moduleRun.errors.join("; "), /page_navigation:started/);
  assert.equal(result.moduleRun.timingBreakdown?.[0]?.label, "deadline lifecycle checkpoint");
  assert.equal(result.moduleRun.timingBreakdown?.[0]?.durationMs, 5);
});
